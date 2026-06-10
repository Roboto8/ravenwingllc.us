const { rollup } = require('../handlers/market-rollup');

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
});
