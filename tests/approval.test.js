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
const approval = require('../handlers/approval');

describe('approval handler', () => {
  beforeEach(() => jest.clearAllMocks());

  const mockEstimate = {
    PK: 'COMPANY#comp-1', SK: 'EST#2026-01-01#est-1',
    id: 'est-1', approvalStatus: 'draft',
    customerName: 'Jane Doe', totalCost: 2500,
    fenceType: 'wood', bom: []
  };

  describe('share', () => {
    test('generates share token and sets status to sent', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.query.mockResolvedValue({ items: [mockEstimate] });
      db.update.mockResolvedValue({});

      const result = await approval.share({
        pathParameters: { id: 'est-1' },
        headers: { origin: 'https://fencetrace.com' }
      });
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.shareToken).toBeDefined();
      expect(body.link).toContain('approve.html?token=');
      expect(db.update).toHaveBeenCalledWith(
        mockEstimate.PK, mockEstimate.SK,
        expect.objectContaining({
          approvalStatus: 'sent',
          shareToken: expect.any(String),
          GSI1PK: expect.stringMatching(/^SHARE#/)
        })
      );
    });

    test('reuses existing share token', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.query.mockResolvedValue({ items: [{ ...mockEstimate, shareToken: 'existing-token' }] });
      db.update.mockResolvedValue({});

      const result = await approval.share({
        pathParameters: { id: 'est-1' },
        headers: { origin: 'https://fencetrace.com' }
      });
      const body = JSON.parse(result.body);

      expect(body.shareToken).toBe('existing-token');
    });

    test('returns 404 for missing estimate', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.query.mockResolvedValue({ items: [] });

      const result = await approval.share({ pathParameters: { id: 'nope' }, headers: {} });
      expect(result.statusCode).toBe(404);
    });

    test('returns 403 when no auth', async () => {
      auth.getCompanyId.mockResolvedValue(null);
      const result = await approval.share({ pathParameters: { id: 'est-1' }, headers: {} });
      expect(result.statusCode).toBe(403);
    });
  });

  describe('getPublic', () => {
    test('returns public estimate data', async () => {
      db.queryGSI.mockResolvedValue([{
        ...mockEstimate,
        GSI1SK: 'COMPANY#comp-1'
      }]);
      db.get.mockResolvedValue({ name: 'Acme Fencing' });

      const result = await approval.getPublic({
        pathParameters: { token: 'abc-token' }
      });
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.customerName).toBe('Jane Doe');
      expect(body.companyName).toBe('Acme Fencing');
      expect(body.PK).toBeUndefined();
      expect(body.SK).toBeUndefined();
    });

    test('returns 404 for invalid token', async () => {
      db.queryGSI.mockResolvedValue([]);

      const result = await approval.getPublic({
        pathParameters: { token: 'bad-token' }
      });
      expect(result.statusCode).toBe(404);
    });
  });

  describe('respond', () => {
    test('records approved response', async () => {
      db.queryGSI.mockResolvedValue([{ ...mockEstimate, approvalHistory: [] }]);
      db.update.mockResolvedValue({});

      const result = await approval.respond({
        pathParameters: { token: 'abc-token' },
        body: JSON.stringify({ action: 'approved', message: 'Looks great!' })
      });
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.approvalStatus).toBe('approved');
      expect(db.update).toHaveBeenCalledWith(
        mockEstimate.PK, mockEstimate.SK,
        expect.objectContaining({
          approvalStatus: 'approved',
          approvalHistory: expect.arrayContaining([
            expect.objectContaining({ action: 'approved', message: 'Looks great!' })
          ])
        })
      );
    });

    test('records changes_requested response', async () => {
      db.queryGSI.mockResolvedValue([{ ...mockEstimate, approvalHistory: [] }]);
      db.update.mockResolvedValue({});

      const result = await approval.respond({
        pathParameters: { token: 'abc-token' },
        body: JSON.stringify({ action: 'changes_requested', message: 'Need vinyl instead' })
      });
      const body = JSON.parse(result.body);

      expect(body.approvalStatus).toBe('changes_requested');
    });

    test('rejects invalid action', async () => {
      const result = await approval.respond({
        pathParameters: { token: 'abc-token' },
        body: JSON.stringify({ action: 'maybe' })
      });
      expect(result.statusCode).toBe(400);
    });

    test('returns 404 for invalid token', async () => {
      db.queryGSI.mockResolvedValue([]);

      const result = await approval.respond({
        pathParameters: { token: 'bad' },
        body: JSON.stringify({ action: 'approved' })
      });
      expect(result.statusCode).toBe(404);
    });
  });
});
