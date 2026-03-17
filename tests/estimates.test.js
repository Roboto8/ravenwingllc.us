jest.mock('../handlers/lib/dynamo', () => ({
  get: jest.fn(),
  put: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  query: jest.fn(),
  queryGSI: jest.fn()
}));

jest.mock('../handlers/lib/auth', () => ({
  getUser: jest.fn(),
  getCompanyId: jest.fn()
}));

const db = require('../handlers/lib/dynamo');
const auth = require('../handlers/lib/auth');
const estimates = require('../handlers/estimates');

describe('estimates handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockEstimate = {
    PK: 'COMPANY#comp-1',
    SK: 'EST#2025-01-15T00:00:00.000Z#est-123',
    id: 'est-123',
    customerName: 'Jane Doe',
    customerPhone: '555-1234',
    customerAddress: '456 Oak Ave',
    fenceType: 'wood',
    fencePrice: 25,
    fenceHeight: 6,
    terrainMultiplier: 1,
    fencePoints: [[37.6, -77.3]],
    fenceClosed: false,
    gates: [],
    addons: {},
    bom: [],
    totalFeet: 100,
    totalCost: 2500,
    materialsCost: 1800,
    status: 'draft',
    createdAt: '2025-01-15T00:00:00.000Z',
    updatedAt: '2025-01-15T00:00:00.000Z'
  };

  const activeCompany = {
    subscriptionStatus: 'active',
    trialEndsAt: '2025-12-31T00:00:00.000Z'
  };

  const trialingCompany = {
    subscriptionStatus: 'trialing',
    trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  };

  const expiredTrialCompany = {
    subscriptionStatus: 'trialing',
    trialEndsAt: '2020-01-01T00:00:00.000Z'
  };

  // ===== LIST =====
  describe('list', () => {
    test('returns paginated estimates', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.query.mockResolvedValue({
        items: [mockEstimate],
        nextKey: null
      });

      const result = await estimates.list({
        queryStringParameters: { limit: '10' }
      });
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.estimates).toHaveLength(1);
      expect(body.estimates[0].id).toBe('est-123');
      expect(body.estimates[0].PK).toBeUndefined(); // keys stripped
      expect(body.estimates[0].SK).toBeUndefined();
      expect(body.cursor).toBeNull();
    });

    test('passes limit to query', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.query.mockResolvedValue({ items: [], nextKey: null });

      await estimates.list({
        queryStringParameters: { limit: '5' }
      });

      expect(db.query).toHaveBeenCalledWith('COMPANY#comp-1', 'EST#', 5, undefined);
    });

    test('defaults limit to 20', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.query.mockResolvedValue({ items: [], nextKey: null });

      await estimates.list({
        queryStringParameters: null
      });

      expect(db.query).toHaveBeenCalledWith('COMPANY#comp-1', 'EST#', 20, undefined);
    });

    test('passes cursor', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.query.mockResolvedValue({ items: [], nextKey: null });

      await estimates.list({
        queryStringParameters: { cursor: 'abc123' }
      });

      expect(db.query).toHaveBeenCalledWith('COMPANY#comp-1', 'EST#', 20, 'abc123');
    });

    test('returns 403 when no auth', async () => {
      auth.getCompanyId.mockResolvedValue(null);
      const result = await estimates.list({ queryStringParameters: {} });
      expect(result.statusCode).toBe(403);
    });
  });

  // ===== CREATE =====
  describe('create', () => {
    test('creates estimate for active subscription', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.get.mockResolvedValue(activeCompany);
      db.put.mockImplementation(item => item);

      const result = await estimates.create({
        body: JSON.stringify({
          customerName: 'Test Customer',
          fenceType: 'vinyl',
          fenceHeight: 8
        })
      });
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(201);
      expect(body.customerName).toBe('Test Customer');
      expect(body.fenceType).toBe('vinyl');
      expect(body.fenceHeight).toBe(8);
      expect(body.status).toBe('draft');
      expect(body.id).toBeDefined();
      expect(body.PK).toBeUndefined(); // keys stripped
    });

    test('creates estimate for active trial', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.get.mockResolvedValue(trialingCompany);
      db.put.mockImplementation(item => item);

      const result = await estimates.create({
        body: JSON.stringify({ customerName: 'Trial User' })
      });
      expect(result.statusCode).toBe(201);
    });

    test('blocks create for expired trial', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.get.mockResolvedValue(expiredTrialCompany);

      const result = await estimates.create({
        body: JSON.stringify({ customerName: 'Expired User' })
      });
      expect(result.statusCode).toBe(403);
      expect(JSON.parse(result.body).error).toContain('Trial expired');
    });

    test('blocks create when no company found', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.get.mockResolvedValue(null);

      const result = await estimates.create({
        body: JSON.stringify({})
      });
      expect(result.statusCode).toBe(403);
    });

    test('blocks create for canceled subscription', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.get.mockResolvedValue({ subscriptionStatus: 'canceled' });

      const result = await estimates.create({
        body: JSON.stringify({})
      });
      expect(result.statusCode).toBe(403);
    });

    test('uses defaults for missing fields', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.get.mockResolvedValue(activeCompany);
      db.put.mockImplementation(item => item);

      const result = await estimates.create({ body: '{}' });
      const body = JSON.parse(result.body);

      expect(body.customerName).toBe('');
      expect(body.fenceType).toBe('wood');
      expect(body.fencePrice).toBe(25);
      expect(body.fenceHeight).toBe(6);
      expect(body.terrainMultiplier).toBe(1);
      expect(body.fencePoints).toEqual([]);
      expect(body.fenceClosed).toBe(false);
      expect(body.gates).toEqual([]);
      expect(body.totalFeet).toBe(0);
      expect(body.totalCost).toBe(0);
    });

    test('returns 403 when no auth', async () => {
      auth.getCompanyId.mockResolvedValue(null);
      const result = await estimates.create({ body: '{}' });
      expect(result.statusCode).toBe(403);
    });

    test('stores PK and SK correctly', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.get.mockResolvedValue(activeCompany);
      db.put.mockImplementation(item => item);

      await estimates.create({ body: '{}' });

      const putArg = db.put.mock.calls[0][0];
      expect(putArg.PK).toBe('COMPANY#comp-1');
      expect(putArg.SK).toMatch(/^EST#/);
    });
  });

  // ===== GET =====
  describe('get', () => {
    test('returns estimate by id', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.query.mockResolvedValue({ items: [mockEstimate] });

      const result = await estimates.get({
        pathParameters: { id: 'est-123' }
      });
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.id).toBe('est-123');
      expect(body.customerName).toBe('Jane Doe');
    });

    test('returns 404 when estimate not found', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.query.mockResolvedValue({ items: [] });

      const result = await estimates.get({
        pathParameters: { id: 'nonexistent' }
      });
      expect(result.statusCode).toBe(404);
    });

    test('returns 403 when no auth', async () => {
      auth.getCompanyId.mockResolvedValue(null);
      const result = await estimates.get({
        pathParameters: { id: 'est-123' }
      });
      expect(result.statusCode).toBe(403);
    });
  });

  // ===== UPDATE =====
  describe('update', () => {
    test('updates allowed fields', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.query.mockResolvedValue({ items: [mockEstimate] });
      db.update.mockResolvedValue({ ...mockEstimate, customerName: 'Updated Name' });

      const result = await estimates.update({
        pathParameters: { id: 'est-123' },
        body: JSON.stringify({ customerName: 'Updated Name' })
      });
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.customerName).toBe('Updated Name');
    });

    test('returns 404 when estimate not found', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.query.mockResolvedValue({ items: [] });

      const result = await estimates.update({
        pathParameters: { id: 'nonexistent' },
        body: JSON.stringify({ customerName: 'Test' })
      });
      expect(result.statusCode).toBe(404);
    });

    test('sets updatedAt on update', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.query.mockResolvedValue({ items: [mockEstimate] });
      db.update.mockResolvedValue(mockEstimate);

      await estimates.update({
        pathParameters: { id: 'est-123' },
        body: JSON.stringify({ status: 'sent' })
      });

      const updateArgs = db.update.mock.calls[0][2];
      expect(updateArgs.updatedAt).toBeDefined();
      expect(updateArgs.status).toBe('sent');
    });

    test('allows updating droneOverlay', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.query.mockResolvedValue({ items: [mockEstimate] });
      const overlay = { bounds: [[37.5, -77.4], [37.6, -77.3]] };
      db.update.mockResolvedValue({ ...mockEstimate, droneOverlay: overlay });

      const result = await estimates.update({
        pathParameters: { id: 'est-123' },
        body: JSON.stringify({ droneOverlay: overlay })
      });

      expect(result.statusCode).toBe(200);
      expect(db.update).toHaveBeenCalledWith(
        mockEstimate.PK, mockEstimate.SK,
        expect.objectContaining({ droneOverlay: overlay })
      );
    });

    test('allows updating fence data', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.query.mockResolvedValue({ items: [mockEstimate] });
      db.update.mockResolvedValue(mockEstimate);

      await estimates.update({
        pathParameters: { id: 'est-123' },
        body: JSON.stringify({
          fenceType: 'vinyl',
          fenceHeight: 8,
          totalFeet: 200,
          totalCost: 5000,
          fencePoints: [[1, 2], [3, 4]],
          fenceClosed: true,
          gates: [{ type: 'double', price: 550 }]
        })
      });

      const updateArgs = db.update.mock.calls[0][2];
      expect(updateArgs.fenceType).toBe('vinyl');
      expect(updateArgs.fenceHeight).toBe(8);
      expect(updateArgs.fenceClosed).toBe(true);
    });

    test('returns 403 when no auth', async () => {
      auth.getCompanyId.mockResolvedValue(null);
      const result = await estimates.update({
        pathParameters: { id: 'est-123' },
        body: '{}'
      });
      expect(result.statusCode).toBe(403);
    });
  });

  // ===== DELETE =====
  describe('remove', () => {
    test('soft deletes estimate', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.query.mockResolvedValue({ items: [mockEstimate] });
      db.update.mockResolvedValue({ ...mockEstimate, status: 'deleted' });

      const result = await estimates.remove({
        pathParameters: { id: 'est-123' }
      });
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.deleted).toBe(true);
      expect(db.update).toHaveBeenCalledWith(
        mockEstimate.PK, mockEstimate.SK,
        expect.objectContaining({ status: 'deleted' })
      );
    });

    test('returns 404 when estimate not found', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.query.mockResolvedValue({ items: [] });

      const result = await estimates.remove({
        pathParameters: { id: 'nonexistent' }
      });
      expect(result.statusCode).toBe(404);
    });

    test('returns 403 when no auth', async () => {
      auth.getCompanyId.mockResolvedValue(null);
      const result = await estimates.remove({
        pathParameters: { id: 'est-123' }
      });
      expect(result.statusCode).toBe(403);
    });
  });

  // ===== canCreate (trial gating) =====
  describe('trial gating (canCreate)', () => {
    test.each([
      ['active subscription', { subscriptionStatus: 'active' }, 201],
      ['active trial', {
        subscriptionStatus: 'trialing',
        trialEndsAt: new Date(Date.now() + 86400000).toISOString()
      }, 201],
      ['expired trial', {
        subscriptionStatus: 'trialing',
        trialEndsAt: '2020-01-01T00:00:00.000Z'
      }, 403],
      ['canceled', { subscriptionStatus: 'canceled' }, 403],
      ['past_due', { subscriptionStatus: 'past_due' }, 403],
      ['null company', null, 403]
    ])('%s => %d', async (label, companyData, expectedStatus) => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.get.mockResolvedValue(companyData);
      db.put.mockImplementation(item => item);

      const result = await estimates.create({ body: '{}' });
      expect(result.statusCode).toBe(expectedStatus);
    });
  });
});
