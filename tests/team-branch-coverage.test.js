/**
 * Tests targeting uncovered branches in team.js
 * Covers: permission deny paths, invite duplicate check, remove self-check, revoke
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
  checkPermission: jest.fn(),
  ALL_PERMISSIONS: []
}));

const db = require('../handlers/lib/dynamo');
const auth = require('../handlers/lib/auth');
const { checkPermission } = require('../handlers/roles');
const team = require('../handlers/team');

describe('team handler - branch coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    checkPermission.mockResolvedValue(true);
  });

  // ===== invite permission branches =====
  describe('invite - permission denied', () => {
    test('returns 403 when user lacks team.invite permission', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      checkPermission.mockResolvedValue(false);

      const result = await team.invite({
        body: JSON.stringify({ email: 'new@test.com' })
      });
      expect(result.statusCode).toBe(403);
    });
  });

  describe('invite - duplicate member check', () => {
    test('rejects invite when email already a team member', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.query.mockResolvedValue({
        items: [{ email: 'existing@test.com', PK: 'COMPANY#comp-1', SK: 'USER#u1' }]
      });

      const result = await team.invite({
        body: JSON.stringify({ email: 'existing@test.com' })
      });
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toMatch(/Already a team member/);
    });
  });

  describe('invite - empty email', () => {
    test('rejects empty email string', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');

      const result = await team.invite({
        body: JSON.stringify({ email: '' })
      });
      expect(result.statusCode).toBe(400);
    });

    test('rejects whitespace-only email', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');

      const result = await team.invite({
        body: JSON.stringify({ email: '   ' })
      });
      expect(result.statusCode).toBe(400);
    });
  });

  // ===== revoke permission branches =====
  describe('revoke - permission denied', () => {
    test('returns 403 when user lacks team.invite permission', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      checkPermission.mockResolvedValue(false);

      const result = await team.revoke({
        pathParameters: { token: 'abc-123' }
      });
      expect(result.statusCode).toBe(403);
    });
  });

  describe('revoke - success', () => {
    test('removes invite and returns revoked true', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.remove.mockResolvedValue();

      const result = await team.revoke({
        pathParameters: { token: 'abc-123' }
      });
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.revoked).toBe(true);
      expect(db.remove).toHaveBeenCalledWith('COMPANY#comp-1', 'INVITE#abc-123');
    });
  });

  // ===== remove permission branches =====
  describe('remove - permission denied', () => {
    test('returns 403 when user lacks team.remove permission', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      checkPermission.mockResolvedValue(false);

      const result = await team.remove({
        pathParameters: { email: 'user@test.com' }
      });
      expect(result.statusCode).toBe(403);
    });
  });

  describe('remove - member not found', () => {
    test('returns 404 when member email not in team', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      auth.getUser.mockReturnValue({ sub: 'owner-sub' });
      db.query.mockResolvedValue({ items: [] });

      const result = await team.remove({
        pathParameters: { email: 'nobody@test.com' }
      });
      expect(result.statusCode).toBe(404);
    });
  });

  describe('remove - cannot remove self', () => {
    test('returns 400 when trying to remove yourself', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      auth.getUser.mockReturnValue({ sub: 'my-sub' });
      db.query.mockResolvedValue({
        items: [{
          email: 'me@test.com',
          PK: 'COMPANY#comp-1',
          SK: 'USER#u1',
          GSI1PK: 'USER#my-sub'
        }]
      });

      const result = await team.remove({
        pathParameters: { email: 'me@test.com' }
      });
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toMatch(/yourself/);
    });
  });

  // ===== validate branches =====
  describe('validate - invite not found', () => {
    test('returns 404 for invalid token', async () => {
      db.queryGSI.mockResolvedValue([]);

      const result = await team.validate({
        pathParameters: { token: 'nonexistent' }
      });
      expect(result.statusCode).toBe(404);
    });
  });

  describe('validate - invite already used', () => {
    test('returns 400 for already-accepted invite', async () => {
      db.queryGSI.mockResolvedValue([{
        status: 'accepted',
        email: 'used@test.com',
        GSI1SK: 'COMPANY#comp-1'
      }]);

      const result = await team.validate({
        pathParameters: { token: 'used-token' }
      });
      expect(result.statusCode).toBe(400);
    });
  });

  // ===== list - invite filtering =====
  describe('list - filters non-pending invites', () => {
    test('only returns pending invites', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.query
        .mockResolvedValueOnce({ items: [] }) // members
        .mockResolvedValueOnce({
          items: [
            { email: 'pending@test.com', token: 't1', status: 'pending', createdAt: '2026-01-01' },
            { email: 'accepted@test.com', token: 't2', status: 'accepted', createdAt: '2026-01-01' },
            { email: 'revoked@test.com', token: 't3', status: 'revoked', createdAt: '2026-01-01' }
          ]
        });

      const result = await team.list({});
      const body = JSON.parse(result.body);

      expect(body.invites).toHaveLength(1);
      expect(body.invites[0].email).toBe('pending@test.com');
    });
  });

  describe('list - returns 403 when no auth', () => {
    test('returns 403 when no companyId', async () => {
      auth.getCompanyId.mockResolvedValue(null);

      const result = await team.list({});
      expect(result.statusCode).toBe(403);
    });
  });
});
