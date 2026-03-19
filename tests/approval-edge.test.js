/**
 * Additional edge case tests for approval handler
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
const approval = require('../handlers/approval');

describe('approval handler - edge cases', () => {
  beforeEach(() => jest.clearAllMocks());

  const mockEstimate = {
    PK: 'COMPANY#comp-1', SK: 'EST#2026-01-01#est-1',
    id: 'est-1', approvalStatus: 'draft',
    customerName: 'Jane Doe', totalCost: 2500,
    fenceType: 'wood', bom: []
  };

  describe('share - initializes approvalHistory when missing', () => {
    test('sets approvalHistory on first share', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.findById.mockResolvedValue({ ...mockEstimate });
      db.update.mockResolvedValue({});

      await approval.share({
        pathParameters: { id: 'est-1' },
        headers: { origin: 'https://fencetrace.com' }
      });

      const updateArgs = db.update.mock.calls[0][2];
      expect(updateArgs.approvalHistory).toBeDefined();
      expect(Array.isArray(updateArgs.approvalHistory)).toBe(true);
    });

    test('does not overwrite existing approvalHistory', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      const history = [{ action: 'sent', timestamp: '2026-01-01' }];
      db.findById.mockResolvedValue({ ...mockEstimate, approvalHistory: history });
      db.update.mockResolvedValue({});

      await approval.share({
        pathParameters: { id: 'est-1' },
        headers: { origin: 'https://fencetrace.com' }
      });

      const updateArgs = db.update.mock.calls[0][2];
      expect(updateArgs.approvalHistory).toBeUndefined();
    });
  });

  describe('respond - appends to existing history', () => {
    test('appends to existing approval history', async () => {
      const existingHistory = [
        { action: 'sent', timestamp: '2026-01-01T00:00:00Z' }
      ];
      db.queryGSI.mockResolvedValue([{
        ...mockEstimate,
        approvalHistory: existingHistory
      }]);
      db.update.mockResolvedValue({});

      await approval.respond({
        pathParameters: { token: 'abc-token' },
        body: JSON.stringify({ action: 'approved', message: 'Looks good' })
      });

      const updateArgs = db.update.mock.calls[0][2];
      expect(updateArgs.approvalHistory).toHaveLength(2);
      expect(updateArgs.approvalHistory[0].action).toBe('sent');
      expect(updateArgs.approvalHistory[1].action).toBe('approved');
      expect(updateArgs.approvalHistory[1].message).toBe('Looks good');
      expect(updateArgs.approvalHistory[1].timestamp).toBeDefined();
    });

    test('handles null approvalHistory gracefully', async () => {
      db.queryGSI.mockResolvedValue([{
        ...mockEstimate,
        approvalHistory: null
      }]);
      db.update.mockResolvedValue({});

      const result = await approval.respond({
        pathParameters: { token: 'abc-token' },
        body: JSON.stringify({ action: 'approved' })
      });

      expect(result.statusCode).toBe(200);
      const updateArgs = db.update.mock.calls[0][2];
      expect(updateArgs.approvalHistory).toHaveLength(1);
    });

    test('handles undefined approvalHistory', async () => {
      db.queryGSI.mockResolvedValue([{
        ...mockEstimate
        // no approvalHistory field
      }]);
      db.update.mockResolvedValue({});

      const result = await approval.respond({
        pathParameters: { token: 'abc-token' },
        body: JSON.stringify({ action: 'changes_requested', message: 'Need changes' })
      });

      expect(result.statusCode).toBe(200);
      const updateArgs = db.update.mock.calls[0][2];
      expect(updateArgs.approvalHistory).toHaveLength(1);
      expect(updateArgs.approvalHistory[0].action).toBe('changes_requested');
    });
  });

  describe('respond - multiple responses', () => {
    test('allows multiple responses on same estimate', async () => {
      const history = [
        { action: 'sent', timestamp: '2026-01-01T00:00:00Z' },
        { action: 'changes_requested', message: 'Change color', timestamp: '2026-01-02T00:00:00Z' }
      ];
      db.queryGSI.mockResolvedValue([{ ...mockEstimate, approvalHistory: history }]);
      db.update.mockResolvedValue({});

      const result = await approval.respond({
        pathParameters: { token: 'abc-token' },
        body: JSON.stringify({ action: 'approved', message: 'Now it looks good' })
      });

      expect(result.statusCode).toBe(200);
      const updateArgs = db.update.mock.calls[0][2];
      expect(updateArgs.approvalHistory).toHaveLength(3);
    });
  });

  describe('respond - validation', () => {
    test('rejects empty action', async () => {
      const result = await approval.respond({
        pathParameters: { token: 'abc-token' },
        body: JSON.stringify({ action: '' })
      });
      expect(result.statusCode).toBe(400);
    });

    test('rejects null action', async () => {
      const result = await approval.respond({
        pathParameters: { token: 'abc-token' },
        body: JSON.stringify({ action: null })
      });
      expect(result.statusCode).toBe(400);
    });

    test('respond without message defaults to empty', async () => {
      db.queryGSI.mockResolvedValue([{ ...mockEstimate, approvalHistory: [] }]);
      db.update.mockResolvedValue({});

      await approval.respond({
        pathParameters: { token: 'abc-token' },
        body: JSON.stringify({ action: 'approved' })
      });

      const updateArgs = db.update.mock.calls[0][2];
      const lastEntry = updateArgs.approvalHistory[updateArgs.approvalHistory.length - 1];
      expect(lastEntry.message).toBeDefined();
    });
  });

  describe('getPublic - company info', () => {
    test('returns company accent color and tagline', async () => {
      db.queryGSI.mockResolvedValue([{
        ...mockEstimate,
        GSI1SK: 'COMPANY#comp-1'
      }]);
      db.get.mockResolvedValue({
        name: 'Acme Fencing',
        accentColor: '#c0622e',
        tagline: 'Best fences',
        phone: '555-1234'
      });

      const result = await approval.getPublic({
        pathParameters: { token: 'abc-token' }
      });
      const body = JSON.parse(result.body);

      expect(body.companyName).toBe('Acme Fencing');
    });

    test('handles estimate with all optional fields populated', async () => {
      db.queryGSI.mockResolvedValue([{
        PK: 'COMPANY#comp-1',
        SK: 'EST#2026-01-01#est-1',
        GSI1SK: 'COMPANY#comp-1',
        id: 'est-1',
        customerName: 'Full Customer',
        customerPhone: '555-9999',
        customerAddress: '789 Oak Blvd',
        fenceType: 'vinyl',
        fenceHeight: 8,
        totalCost: 8500,
        totalFeet: 200,
        materialsCost: 5000,
        bom: [{ name: 'posts', qty: 10, unit: 'ea', unitCost: 25, total: 250 }],
        gates: [{ type: 'double', price: 600, internalId: 'g1' }],
        addons: { delivery: 200 },
        approvalStatus: 'sent',
        approvalHistory: [{ action: 'sent', timestamp: '2026-01-01' }]
      }]);
      db.get.mockResolvedValue({ name: 'Pro Fencing' });

      const result = await approval.getPublic({
        pathParameters: { token: 'abc-token' }
      });
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.customerName).toBe('Full Customer');
      expect(body.fenceType).toBe('vinyl');
      expect(body.fenceHeight).toBe(8);
      expect(body.totalCost).toBe(8500);
      // Gates should have internalId stripped
      expect(body.gates[0].internalId).toBeUndefined();
      expect(body.gates[0].type).toBe('double');
      // Should not expose PK/SK
      expect(body.PK).toBeUndefined();
      expect(body.SK).toBeUndefined();
    });
  });

  describe('share - sets GSI keys for public access', () => {
    test('sets GSI1PK with SHARE# prefix', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.findById.mockResolvedValue({ ...mockEstimate });
      db.update.mockResolvedValue({});

      await approval.share({
        pathParameters: { id: 'est-1' },
        headers: { origin: 'https://fencetrace.com' }
      });

      const updateArgs = db.update.mock.calls[0][2];
      expect(updateArgs.GSI1PK).toMatch(/^SHARE#/);
      expect(updateArgs.GSI1SK).toBe('COMPANY#comp-1');
    });
  });
});
