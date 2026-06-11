const mockSend = jest.fn();
jest.mock('@aws-sdk/client-dynamodb', () => ({ DynamoDBClient: jest.fn() }));
jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: jest.fn(() => ({ send: mockSend })) },
  ScanCommand: jest.fn().mockImplementation((input) => ({ __type: 'Scan', input })),
  BatchWriteCommand: jest.fn().mockImplementation((input) => ({ __type: 'BatchWrite', input })),
}));

const { rollup, handler } = require('../handlers/market-rollup');

const NOW = new Date('2026-06-10T12:00:00Z');

function est(overrides) {
  return {
    SK: 'EST#2026-06-01T00:00:00.000Z#x',
    status: 'draft',
    fenceType: 'wood',
    regionKey: '39.1,-84.5',
    createdAt: '2026-06-01T00:00:00.000Z',
    totalFeet: 100,
    pricePerFoot: 30,
    ...overrides,
  };
}

describe('market rollup aggregation', () => {
  test('groups by region, month, and fence type', () => {
    const items = rollup([
      est({}),
      est({ fenceType: 'vinyl' }),
      est({ regionKey: '40.0,-83.0' }),
      est({ createdAt: '2026-05-15T00:00:00.000Z' }),
    ], NOW);
    expect(items).toHaveLength(4);
    const keys = items.map((i) => i.PK + '/' + i.SK).sort();
    expect(keys).toEqual([
      'MARKET#39.1,-84.5/AGG#2026-05#wood',
      'MARKET#39.1,-84.5/AGG#2026-06#vinyl',
      'MARKET#39.1,-84.5/AGG#2026-06#wood',
      'MARKET#40.0,-83.0/AGG#2026-06#wood',
    ]);
  });

  test('skips deleted estimates and ones without a regionKey', () => {
    const items = rollup([
      est({ status: 'deleted' }),
      est({ regionKey: undefined }),
      est({}),
    ], NOW);
    expect(items).toHaveLength(1);
    expect(items[0].quotes).toBe(1);
  });

  test('computes price-per-foot stats and footage', () => {
    const items = rollup([
      est({ pricePerFoot: 20 }),
      est({ pricePerFoot: 30 }),
      est({ pricePerFoot: 40 }),
    ], NOW);
    expect(items[0].ppfMedian).toBe(30);
    expect(items[0].ppfMin).toBe(20);
    expect(items[0].ppfMax).toBe(40);
    expect(items[0].totalFeet).toBe(300);
  });

  test('acceptance and win rates from outcomes', () => {
    const items = rollup([
      est({ status: 'won', sentAt: '2026-06-01T00:00:00.000Z', wonAt: '2026-06-04T00:00:00.000Z' }),
      est({ status: 'lost' }),
      est({ status: 'sent' }),
      est({ status: 'approved' }),
      est({ status: 'draft' }),
    ], NOW);
    const agg = items[0];
    expect(agg.quotes).toBe(5);
    expect(agg.sent).toBe(4); // everything that reached a customer
    expect(agg.acceptanceRate).toBe(0.5); // (1 approved + 1 won) / 4 sent
    expect(agg.winRate).toBe(0.5); // 1 won / (1 won + 1 lost)
    expect(agg.medianDaysToWin).toBe(3);
  });

  test('final sale price-per-foot tracked separately from quoted', () => {
    const items = rollup([
      est({ status: 'won', finalPrice: 2500, totalFeet: 100, pricePerFoot: 30 }),
    ], NOW);
    expect(items[0].finalPpfMedian).toBe(25);
    expect(items[0].ppfMedian).toBe(30);
  });

  test('flags thin samples but still stores them', () => {
    const items = rollup([est({}), est({})], NOW);
    expect(items[0].thinSample).toBe(true);
    const big = rollup([est({}), est({}), est({}), est({}), est({})], NOW);
    expect(big[0].thinSample).toBe(false);
  });

  test('aggregates carry no customer-identifying fields', () => {
    const items = rollup([
      est({ customerName: 'Jane', customerEmail: 'j@x.com', customerAddress: '1 Main St', customerPhone: '555' }),
    ], NOW);
    const json = JSON.stringify(items[0]);
    expect(json).not.toMatch(/Jane|j@x\.com|Main St|555/);
  });

  test('ignores nonsensical days-to-win (negative or over a year)', () => {
    const items = rollup([
      est({ status: 'won', sentAt: '2026-06-05T00:00:00.000Z', wonAt: '2026-06-01T00:00:00.000Z' }),
    ], NOW);
    expect(items[0].medianDaysToWin).toBeNull();
  });

  test('excludes estimates from benchmark-opted-out companies', () => {
    const items = rollup([
      est({ PK: 'COMPANY#opted-out' }),
      est({ PK: 'COMPANY#participating' }),
      est({ PK: 'COMPANY#participating' }),
    ], NOW, new Set(['COMPANY#opted-out']));
    expect(items).toHaveLength(1);
    expect(items[0].quotes).toBe(2);
  });

  test('no opt-out set means every company aggregates (default)', () => {
    const items = rollup([
      est({ PK: 'COMPANY#a' }),
      est({ PK: 'COMPANY#b' }),
    ], NOW);
    expect(items[0].quotes).toBe(2);
  });
});

describe('market rollup handler (scan + opt-out wiring)', () => {
  beforeEach(() => mockSend.mockReset());

  test('one scan collects profiles and estimates; opted-out estimates never aggregate', async () => {
    const writes = [];
    let scanInput;
    mockSend.mockImplementation(async (cmd) => {
      if (cmd.__type === 'Scan') {
        scanInput = cmd.input;
        return {
          Items: [
            { PK: 'COMPANY#a', SK: 'PROFILE', benchmarkOptOut: true },
            { PK: 'COMPANY#b', SK: 'PROFILE' },
            { ...est({}), PK: 'COMPANY#a' },
            { ...est({}), PK: 'COMPANY#b' },
          ],
        };
      }
      writes.push(cmd.input);
      return {};
    });

    const out = await handler();

    // Scan picks up PROFILE items alongside estimates in a single pass
    expect(scanInput.FilterExpression).toBe('begins_with(SK, :est) OR SK = :profile');
    expect(scanInput.ExpressionAttributeValues).toEqual({ ':est': 'EST#', ':profile': 'PROFILE' });

    // Profiles are not counted as estimates; opted-out company excluded
    expect(out.estimatesScanned).toBe(2);
    expect(out.aggregatesWritten).toBe(1);
    const written = writes[0].RequestItems[Object.keys(writes[0].RequestItems)[0]];
    expect(written).toHaveLength(1);
    expect(written[0].PutRequest.Item.quotes).toBe(1);
  });

  test('paginated scan accumulates opt-outs across pages', async () => {
    const pages = [
      { Items: [{ PK: 'COMPANY#a', SK: 'PROFILE', benchmarkOptOut: true }], LastEvaluatedKey: { PK: 'x' } },
      { Items: [{ ...est({}), PK: 'COMPANY#a' }, { ...est({}), PK: 'COMPANY#b' }] },
    ];
    mockSend.mockImplementation(async (cmd) => {
      if (cmd.__type === 'Scan') return pages.shift();
      return {};
    });

    const out = await handler();
    expect(out.estimatesScanned).toBe(2);
    expect(out.aggregatesWritten).toBe(1);
  });
});
