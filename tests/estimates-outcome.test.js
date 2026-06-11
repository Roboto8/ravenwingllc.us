// Outcome tracking + market-field derivation on the estimates handler
// (won/lost statuses, server-stamped transition times, regionKey/pricePerFoot).
jest.mock('../handlers/lib/dynamo', () => ({
  get: jest.fn(),
  put: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  query: jest.fn(),
  findById: jest.fn(),
  queryGSI: jest.fn()
}));

jest.mock('../handlers/lib/auth', () => ({
  getUser: jest.fn(),
  getCompanyId: jest.fn()
}));

jest.mock('../handlers/roles', () => ({
  checkPermission: jest.fn().mockResolvedValue(true),
  ALL_PERMISSIONS: []
}));

const db = require('../handlers/lib/dynamo');
const auth = require('../handlers/lib/auth');
const estimates = require('../handlers/estimates');

const baseEstimate = {
  PK: 'COMPANY#comp-1',
  SK: 'EST#2026-06-01T00:00:00.000Z#est-1',
  id: 'est-1',
  status: 'sent',
  sentAt: '2026-06-01T00:00:00.000Z',
  fenceType: 'wood',
  fencePoints: [[39.123, -84.512], [39.125, -84.514]],
  totalFeet: 200,
  totalCost: 6000,
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z'
};

function updateEvent(body) {
  return {
    pathParameters: { id: 'est-1' },
    body: JSON.stringify(body)
  };
}

describe('estimate outcome tracking', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.getCompanyId.mockResolvedValue('comp-1');
    db.findById.mockResolvedValue({ ...baseEstimate });
    db.update.mockImplementation(async (pk, sk, updates) => ({ ...baseEstimate, ...updates }));
  });

  test('accepts won status, stamps wonAt, persists finalPrice', async () => {
    const res = await estimates.update(updateEvent({ status: 'won', finalPrice: 5800 }));
    expect(res.statusCode).toBe(200);
    const updates = db.update.mock.calls[0][2];
    expect(updates.status).toBe('won');
    expect(updates.finalPrice).toBe(5800);
    expect(updates.wonAt).toBeDefined();
  });

  test('accepts lost status with lostReason, stamps lostAt', async () => {
    const res = await estimates.update(updateEvent({ status: 'lost', lostReason: 'price too high' }));
    expect(res.statusCode).toBe(200);
    const updates = db.update.mock.calls[0][2];
    expect(updates.lostAt).toBeDefined();
    expect(updates.lostReason).toBe('price too high');
  });

  test('does not restamp wonAt on a second won update', async () => {
    db.findById.mockResolvedValue({ ...baseEstimate, status: 'won', wonAt: '2026-06-05T00:00:00.000Z' });
    await estimates.update(updateEvent({ status: 'won' }));
    const updates = db.update.mock.calls[0][2];
    expect(updates.wonAt).toBeUndefined();
  });

  test('stamps sentAt on first transition to sent only', async () => {
    db.findById.mockResolvedValue({ ...baseEstimate, status: 'draft', sentAt: undefined });
    await estimates.update(updateEvent({ status: 'sent' }));
    expect(db.update.mock.calls[0][2].sentAt).toBeDefined();
  });

  test('rejects invalid finalPrice and oversized lostReason', async () => {
    expect((await estimates.update(updateEvent({ finalPrice: -5 }))).statusCode).toBe(400);
    expect((await estimates.update(updateEvent({ finalPrice: 'lots' }))).statusCode).toBe(400);
    expect((await estimates.update(updateEvent({ lostReason: 'x'.repeat(501) }))).statusCode).toBe(400);
  });

  test('derives regionKey and pricePerFoot on update', async () => {
    await estimates.update(updateEvent({ totalCost: 7000 }));
    const updates = db.update.mock.calls[0][2];
    expect(updates.regionKey).toBe('39.1,-84.5');
    expect(updates.pricePerFoot).toBe(35);
  });

  test('derives market fields on create', async () => {
    db.get.mockResolvedValue({ subscriptionStatus: 'active', tier: 'pro' });
    const res = await estimates.create({
      body: JSON.stringify({
        fencePoints: [[40.001, -83.001]],
        totalFeet: 100,
        totalCost: 2500
      })
    });
    expect(res.statusCode).toBe(201);
    const item = db.put.mock.calls[0][0];
    expect(item.regionKey).toBe('40.0,-83.0');
    expect(item.pricePerFoot).toBe(25);
  });

  test('no regionKey when fence has no points', async () => {
    db.get.mockResolvedValue({ subscriptionStatus: 'active', tier: 'pro' });
    const res = await estimates.create({ body: JSON.stringify({ customerName: 'A' }) });
    expect(res.statusCode).toBe(201);
    expect(db.put.mock.calls[0][0].regionKey).toBeUndefined();
  });

  // Clients send fencePoints as both [lat, lng] arrays and {lat, lng} objects;
  // deriveMarketFields must accept either or the rollup corpus silently starves.
  test('derives market fields from {lat,lng} object points on create', async () => {
    db.get.mockResolvedValue({ subscriptionStatus: 'active', tier: 'pro' });
    const res = await estimates.create({
      body: JSON.stringify({
        fencePoints: [{ lat: 40.001, lng: -83.001 }],
        totalFeet: 100,
        totalCost: 2500
      })
    });
    expect(res.statusCode).toBe(201);
    const item = db.put.mock.calls[0][0];
    expect(item.regionKey).toBe('40.0,-83.0');
    expect(item.pricePerFoot).toBe(25);
  });

  test('derives regionKey from {lat,lng} object points on update', async () => {
    db.findById.mockResolvedValue({
      ...baseEstimate,
      fencePoints: [{ lat: 39.123, lng: -84.512 }, { lat: 39.125, lng: -84.514 }]
    });
    await estimates.update(updateEvent({ totalCost: 7000 }));
    const updates = db.update.mock.calls[0][2];
    expect(updates.regionKey).toBe('39.1,-84.5');
    expect(updates.pricePerFoot).toBe(35);
  });

  test('mixed array and object point shapes both count toward the centroid', async () => {
    db.get.mockResolvedValue({ subscriptionStatus: 'active', tier: 'pro' });
    const res = await estimates.create({
      body: JSON.stringify({
        fencePoints: [[39.1, -84.5], { lat: 39.3, lng: -84.7 }],
        totalFeet: 100,
        totalCost: 2500
      })
    });
    expect(res.statusCode).toBe(201);
    expect(db.put.mock.calls[0][0].regionKey).toBe('39.2,-84.6');
  });

  test('ignores malformed points (string coords, nulls) when deriving regionKey', async () => {
    db.get.mockResolvedValue({ subscriptionStatus: 'active', tier: 'pro' });
    const res = await estimates.create({
      body: JSON.stringify({
        fencePoints: [{ lat: '39.1', lng: -84.5 }, null, { lng: -84.5 }, [40.0, -83.0]],
        totalFeet: 100,
        totalCost: 2500
      })
    });
    expect(res.statusCode).toBe(201);
    expect(db.put.mock.calls[0][0].regionKey).toBe('40.0,-83.0');
  });
});
