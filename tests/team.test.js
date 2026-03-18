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

jest.mock('../handlers/roles', () => ({
  checkPermission: jest.fn().mockResolvedValue(true),
  ALL_PERMISSIONS: []
}));

const db = require('../handlers/lib/dynamo');
const auth = require('../handlers/lib/auth');
const team = require('../handlers/team');

describe('team handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('list', () => {
    test('returns members and pending invites', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.query
        .mockResolvedValueOnce({ items: [
          { email: 'owner@test.com', name: '', role: 'owner', createdAt: '2026-01-01' },
          { email: 'member@test.com', name: '', role: 'member', createdAt: '2026-02-01' }
        ]})
        .mockResolvedValueOnce({ items: [
          { email: 'invited@test.com', token: 'abc-123', status: 'pending', createdAt: '2026-03-01' },
          { email: 'used@test.com', token: 'def-456', status: 'accepted', createdAt: '2026-02-15' }
        ]});

      const result = await team.list({});
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.members).toHaveLength(2);
      expect(body.invites).toHaveLength(1); // only pending
      expect(body.invites[0].email).toBe('invited@test.com');
    });

    test('returns 403 when no auth', async () => {
      auth.getCompanyId.mockResolvedValue(null);
      const result = await team.list({});
      expect(result.statusCode).toBe(403);
    });
  });

  describe('invite', () => {
    test('creates invite with token', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.query.mockResolvedValue({ items: [] });
      db.put.mockResolvedValue({});

      const result = await team.invite({
        body: JSON.stringify({ email: 'new@test.com' })
      });
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(201);
      expect(body.token).toBeDefined();
      expect(body.email).toBe('new@test.com');
      expect(db.put).toHaveBeenCalledWith(expect.objectContaining({
        PK: 'COMPANY#comp-1',
        email: 'new@test.com',
        status: 'pending'
      }));
    });

    test('rejects invalid email', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');

      const result = await team.invite({
        body: JSON.stringify({ email: 'notanemail' })
      });
      expect(result.statusCode).toBe(400);
    });

    test('rejects empty email', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');

      const result = await team.invite({
        body: JSON.stringify({ email: '' })
      });
      expect(result.statusCode).toBe(400);
    });

    test('rejects existing member', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.query.mockResolvedValue({ items: [
        { email: 'existing@test.com', role: 'member' }
      ]});

      const result = await team.invite({
        body: JSON.stringify({ email: 'existing@test.com' })
      });
      expect(result.statusCode).toBe(400);
    });

    test('returns 403 when no auth', async () => {
      auth.getCompanyId.mockResolvedValue(null);
      const result = await team.invite({ body: JSON.stringify({ email: 'a@b.com' }) });
      expect(result.statusCode).toBe(403);
    });
  });

  describe('revoke', () => {
    test('removes invite', async () => {
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

    test('returns 403 when no auth', async () => {
      auth.getCompanyId.mockResolvedValue(null);
      const result = await team.revoke({ pathParameters: { token: 'x' } });
      expect(result.statusCode).toBe(403);
    });
  });

  describe('remove', () => {
    test('removes a team member', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      auth.getUser.mockReturnValue({ sub: 'owner-sub' });
      db.query.mockResolvedValue({ items: [
        { email: 'member@test.com', PK: 'COMPANY#comp-1', SK: 'USER#member-sub', GSI1PK: 'USER#member-sub' }
      ]});
      db.remove.mockResolvedValue();

      const result = await team.remove({
        pathParameters: { email: 'member@test.com' }
      });
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.removed).toBe(true);
    });

    test('cannot remove yourself', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      auth.getUser.mockReturnValue({ sub: 'my-sub' });
      db.query.mockResolvedValue({ items: [
        { email: 'me@test.com', PK: 'COMPANY#comp-1', SK: 'USER#my-sub', GSI1PK: 'USER#my-sub' }
      ]});

      const result = await team.remove({
        pathParameters: { email: 'me@test.com' }
      });
      expect(result.statusCode).toBe(400);
    });

    test('returns 404 for unknown member', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      auth.getUser.mockReturnValue({ sub: 'owner-sub' });
      db.query.mockResolvedValue({ items: [] });

      const result = await team.remove({
        pathParameters: { email: 'nobody@test.com' }
      });
      expect(result.statusCode).toBe(404);
    });
  });

  describe('validate', () => {
    test('validates a pending invite', async () => {
      db.queryGSI.mockResolvedValue([{
        status: 'pending',
        email: 'new@test.com',
        GSI1SK: 'COMPANY#comp-1'
      }]);
      db.get.mockResolvedValue({ name: 'Acme Fencing' });

      const result = await team.validate({
        pathParameters: { token: 'abc-123' }
      });
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.valid).toBe(true);
      expect(body.companyName).toBe('Acme Fencing');
      expect(body.email).toBe('new@test.com');
    });

    test('returns 404 for invalid token', async () => {
      db.queryGSI.mockResolvedValue([]);

      const result = await team.validate({
        pathParameters: { token: 'bad-token' }
      });
      expect(result.statusCode).toBe(404);
    });

    test('returns 400 for already used invite', async () => {
      db.queryGSI.mockResolvedValue([{ status: 'accepted' }]);

      const result = await team.validate({
        pathParameters: { token: 'used-token' }
      });
      expect(result.statusCode).toBe(400);
    });
  });
});
