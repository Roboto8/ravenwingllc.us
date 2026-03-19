/**
 * Additional edge case tests for estimates handler
 */
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

describe('estimates handler - edge cases', () => {
  beforeEach(() => jest.clearAllMocks());

  const mockEstimate = {
    PK: 'COMPANY#comp-1',
    SK: 'EST#2025-01-15T00:00:00.000Z#est-123',
    id: 'est-123',
    customerName: 'Jane Doe',
    fenceType: 'wood',
    fenceHeight: 6,
    status: 'draft',
    createdAt: '2025-01-15T00:00:00.000Z',
    updatedAt: '2025-01-15T00:00:00.000Z'
  };

  // ===== UPDATE - disallowed fields silently ignored =====
  describe('update - field filtering', () => {
    test('silently ignores PK/SK/GSI fields in updates', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.findById.mockResolvedValue(mockEstimate);
      db.update.mockResolvedValue(mockEstimate);

      await estimates.update({
        pathParameters: { id: 'est-123' },
        body: JSON.stringify({
          PK: 'COMPANY#hacked',
          SK: 'HACK',
          GSI1PK: 'HACK',
          GSI1SK: 'HACK',
          customerName: 'Legit Update'
        })
      });

      const updateArgs = db.update.mock.calls[0][2];
      expect(updateArgs.PK).toBeUndefined();
      expect(updateArgs.SK).toBeUndefined();
      expect(updateArgs.GSI1PK).toBeUndefined();
      expect(updateArgs.GSI1SK).toBeUndefined();
      expect(updateArgs.customerName).toBe('Legit Update');
    });

    test('silently ignores id and createdAt in updates', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.findById.mockResolvedValue(mockEstimate);
      db.update.mockResolvedValue(mockEstimate);

      await estimates.update({
        pathParameters: { id: 'est-123' },
        body: JSON.stringify({
          id: 'new-id',
          createdAt: '2000-01-01',
          customerName: 'Valid'
        })
      });

      const updateArgs = db.update.mock.calls[0][2];
      expect(updateArgs.id).toBeUndefined();
      expect(updateArgs.createdAt).toBeUndefined();
      expect(updateArgs.customerName).toBe('Valid');
    });

    test('allows updating mulch fields', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.findById.mockResolvedValue(mockEstimate);
      db.update.mockResolvedValue(mockEstimate);

      await estimates.update({
        pathParameters: { id: 'est-123' },
        body: JSON.stringify({
          mulchAreas: [{ points: [], area: 500 }],
          mulchMaterial: 'cedar',
          mulchDepth: 4,
          mulchDelivery: 'bulk'
        })
      });

      const updateArgs = db.update.mock.calls[0][2];
      expect(updateArgs.mulchAreas).toHaveLength(1);
      expect(updateArgs.mulchMaterial).toBe('cedar');
      expect(updateArgs.mulchDepth).toBe(4);
      expect(updateArgs.mulchDelivery).toBe('bulk');
    });

    test('allows updating approvalStatus and shareToken', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.findById.mockResolvedValue(mockEstimate);
      db.update.mockResolvedValue(mockEstimate);

      await estimates.update({
        pathParameters: { id: 'est-123' },
        body: JSON.stringify({
          approvalStatus: 'sent',
          shareToken: 'tok-abc',
          approvalHistory: [{ action: 'sent', timestamp: '2026-01-01' }]
        })
      });

      const updateArgs = db.update.mock.calls[0][2];
      expect(updateArgs.approvalStatus).toBe('sent');
      expect(updateArgs.shareToken).toBe('tok-abc');
      expect(updateArgs.approvalHistory).toHaveLength(1);
    });

    test('updatedAt is a valid ISO string', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.findById.mockResolvedValue(mockEstimate);
      db.update.mockResolvedValue(mockEstimate);

      await estimates.update({
        pathParameters: { id: 'est-123' },
        body: JSON.stringify({ status: 'sent' })
      });

      const updateArgs = db.update.mock.calls[0][2];
      expect(updateArgs.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(new Date(updateArgs.updatedAt).toISOString()).toBe(updateArgs.updatedAt);
    });
  });

  // ===== CREATE - all field defaults =====
  describe('create - complete defaults', () => {
    const activeCompany = { subscriptionStatus: 'active' };

    test('sets all mulch defaults', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.get.mockResolvedValue(activeCompany);
      db.put.mockImplementation(item => item);

      const result = await estimates.create({ body: '{}' });
      const body = JSON.parse(result.body);

      expect(body.mulchAreas).toEqual([]);
      expect(body.mulchMaterial).toBe('hardwood');
      expect(body.mulchDepth).toBe(3);
      expect(body.mulchDelivery).toBe('bags');
    });

    test('sets approval defaults', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.get.mockResolvedValue(activeCompany);
      db.put.mockImplementation(item => item);

      const result = await estimates.create({ body: '{}' });
      const body = JSON.parse(result.body);

      expect(body.approvalStatus).toBe('draft');
      expect(body.customerEmail).toBe('');
      expect(body.droneOverlay).toBeNull();
      expect(body.photos).toEqual([]);
    });

    test('sets correct SK format with timestamp and UUID', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.get.mockResolvedValue(activeCompany);
      db.put.mockImplementation(item => item);

      await estimates.create({ body: '{}' });

      const putArg = db.put.mock.calls[0][0];
      expect(putArg.SK).toMatch(/^EST#\d{4}-\d{2}-\d{2}T.*#[a-f0-9-]+$/);
    });

    test('each create generates a unique id', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.get.mockResolvedValue(activeCompany);
      db.put.mockImplementation(item => item);

      const r1 = await estimates.create({ body: '{}' });
      const r2 = await estimates.create({ body: '{}' });

      expect(JSON.parse(r1.body).id).not.toBe(JSON.parse(r2.body).id);
    });
  });

  // ===== LIST - filters deleted estimates =====
  describe('list - filters deleted', () => {
    test('excludes deleted estimates from list', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.query.mockResolvedValue({
        items: [
          { ...mockEstimate, id: 'e1', status: 'draft' },
          { ...mockEstimate, id: 'e2', status: 'deleted' },
          { ...mockEstimate, id: 'e3', status: 'approved' }
        ],
        nextKey: null
      });

      const result = await estimates.list({ queryStringParameters: {} });
      const body = JSON.parse(result.body);

      expect(body.estimates).toHaveLength(2);
      expect(body.estimates.map(e => e.id)).toEqual(['e1', 'e3']);
    });

    test('handles NaN limit gracefully', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.query.mockResolvedValue({ items: [], nextKey: null });

      await estimates.list({
        queryStringParameters: { limit: 'abc' }
      });

      // parseInt('abc') = NaN, which gets passed to query
      expect(db.query).toHaveBeenCalled();
    });
  });

  // ===== DELETE - sets deletedAt timestamp =====
  describe('remove - deletedAt', () => {
    test('sets deletedAt as ISO timestamp', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.findById.mockResolvedValue(mockEstimate);
      db.update.mockResolvedValue({});

      const before = new Date().toISOString();
      await estimates.remove({ pathParameters: { id: 'est-123' } });
      const after = new Date().toISOString();

      const updateArgs = db.update.mock.calls[0][2];
      expect(updateArgs.deletedAt).toBeDefined();
      expect(updateArgs.deletedAt >= before).toBe(true);
      expect(updateArgs.deletedAt <= after).toBe(true);
    });
  });

  // ===== RESTORE - clears deletedAt =====
  describe('restore - response', () => {
    test('returns the estimate data in response', async () => {
      const deletedEst = { ...mockEstimate, status: 'deleted', deletedAt: '2025-06-01' };
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.findById.mockResolvedValue(deletedEst);
      db.update.mockResolvedValue({});

      const result = await estimates.restore({ pathParameters: { id: 'est-123' } });
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.id).toBe('est-123');
      expect(body.customerName).toBe('Jane Doe');
    });
  });

  // ===== CREATE - preserves provided values =====
  describe('create - provided values', () => {
    test('respects user-provided customerEmail', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.get.mockResolvedValue({ subscriptionStatus: 'active' });
      db.put.mockImplementation(item => item);

      const result = await estimates.create({
        body: JSON.stringify({
          customerEmail: 'customer@example.com',
          customerName: 'John',
          fenceType: 'vinyl',
          fenceHeight: 8,
          fencePrice: 35,
          terrainMultiplier: 1.2,
          totalFeet: 150,
          totalCost: 5000,
          materialsCost: 3000
        })
      });
      const body = JSON.parse(result.body);

      expect(body.customerEmail).toBe('customer@example.com');
      expect(body.fenceType).toBe('vinyl');
      expect(body.fenceHeight).toBe(8);
      expect(body.fencePrice).toBe(35);
      expect(body.terrainMultiplier).toBe(1.2);
    });
  });
});
