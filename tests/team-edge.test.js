/**
 * Additional edge case tests for team, company, notifications, photos handlers
 */
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
const company = require('../handlers/company');
const notifications = require('../handlers/notifications');

describe('team handler - edge cases', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('invite - email normalization', () => {
    test('normalizes email to lowercase', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.query.mockResolvedValue({ items: [] });
      db.put.mockResolvedValue({});

      const result = await team.invite({
        body: JSON.stringify({ email: '  JoHn@Test.COM  ' })
      });
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(201);
      expect(body.email).toBe('john@test.com');
    });

    test('trims whitespace from email', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.query.mockResolvedValue({ items: [] });
      db.put.mockResolvedValue({});

      const result = await team.invite({
        body: JSON.stringify({ email: '  user@domain.com  ' })
      });
      const body = JSON.parse(result.body);
      expect(body.email).toBe('user@domain.com');
    });

    test('rejects email without @', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      const result = await team.invite({
        body: JSON.stringify({ email: 'invalidemail.com' })
      });
      expect(result.statusCode).toBe(400);
    });

    test('rejects null body', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      const result = await team.invite({ body: null });
      expect(result.statusCode).toBe(400);
    });

    test('creates invite with GSI keys for token lookup', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.query.mockResolvedValue({ items: [] });
      db.put.mockResolvedValue({});

      await team.invite({
        body: JSON.stringify({ email: 'new@test.com' })
      });

      const putArg = db.put.mock.calls[0][0];
      expect(putArg.GSI1PK).toMatch(/^INVITE#/);
      expect(putArg.GSI1SK).toBe('COMPANY#comp-1');
      expect(putArg.token).toBeDefined();
      expect(putArg.SK).toBe('INVITE#' + putArg.token);
    });
  });

  describe('remove - edge cases', () => {
    test('returns 403 when no auth', async () => {
      auth.getCompanyId.mockResolvedValue(null);
      const result = await team.remove({ pathParameters: { email: 'a@b.com' } });
      expect(result.statusCode).toBe(403);
    });

    test('handles URL-encoded email in pathParameters', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      auth.getUser.mockReturnValue({ sub: 'owner-sub' });
      db.query.mockResolvedValue({
        items: [{ email: 'user+tag@test.com', PK: 'COMPANY#comp-1', SK: 'USER#u1', GSI1PK: 'USER#u1' }]
      });
      db.remove.mockResolvedValue();

      const result = await team.remove({
        pathParameters: { email: 'user%2Btag%40test.com' }
      });
      expect(result.statusCode).toBe(200);
    });
  });

  describe('validate - edge cases', () => {
    test('returns Unknown company name when company not found', async () => {
      db.queryGSI.mockResolvedValue([{
        status: 'pending',
        email: 'new@test.com',
        GSI1SK: 'COMPANY#comp-1'
      }]);
      db.get.mockResolvedValue(null);

      const result = await team.validate({
        pathParameters: { token: 'abc-123' }
      });
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.companyName).toBe('Unknown');
    });
  });

  describe('list - edge cases', () => {
    test('returns empty arrays when no members or invites', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.query
        .mockResolvedValueOnce({ items: [] })
        .mockResolvedValueOnce({ items: [] });

      const result = await team.list({});
      const body = JSON.parse(result.body);

      expect(body.members).toEqual([]);
      expect(body.invites).toEqual([]);
    });

    test('maps member fields correctly', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.query
        .mockResolvedValueOnce({
          items: [{
            email: 'user@test.com',
            name: 'John Doe',
            role: 'member',
            createdAt: '2026-01-01',
            PK: 'should-be-stripped',
            SK: 'should-be-stripped'
          }]
        })
        .mockResolvedValueOnce({ items: [] });

      const result = await team.list({});
      const body = JSON.parse(result.body);

      expect(body.members[0]).toEqual({
        email: 'user@test.com',
        name: 'John Doe',
        role: 'member',
        joinedAt: '2026-01-01'
      });
      // Should not leak PK/SK
      expect(body.members[0].PK).toBeUndefined();
    });
  });
});

describe('company handler - edge cases', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('get - language default', () => {
    test('defaults language to en when not set', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.get.mockResolvedValue({
        name: 'Test Co',
        email: 'test@co.com'
      });

      const result = await company.get({});
      const body = JSON.parse(result.body);

      expect(body.language).toBe('en');
    });

    test('returns stored language when set', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.get.mockResolvedValue({
        name: 'Test Co',
        email: 'test@co.com',
        language: 'es'
      });

      const result = await company.get({});
      const body = JSON.parse(result.body);
      expect(body.language).toBe('es');
    });
  });

  describe('update - language field', () => {
    test('allows updating language', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.update.mockResolvedValue({ name: 'Co', language: 'fr' });

      const result = await company.update({
        body: JSON.stringify({ language: 'fr' })
      });

      expect(result.statusCode).toBe(200);
      expect(db.update).toHaveBeenCalledWith(
        'COMPANY#comp-1', 'PROFILE',
        expect.objectContaining({ language: 'fr' })
      );
    });

    test('allows updating logoKey', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.update.mockResolvedValue({ logoKey: 'logos/new.png' });

      await company.update({
        body: JSON.stringify({ logoKey: 'logos/new.png' })
      });

      const updateCall = db.update.mock.calls[0][2];
      expect(updateCall.logoKey).toBe('logos/new.png');
    });

    test('allows updating accentColor', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.update.mockResolvedValue({ accentColor: '#ff6600' });

      await company.update({
        body: JSON.stringify({ accentColor: '#ff6600' })
      });

      const updateCall = db.update.mock.calls[0][2];
      expect(updateCall.accentColor).toBe('#ff6600');
    });

    test('allows updating address', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.update.mockResolvedValue({ address: '456 New St' });

      await company.update({
        body: JSON.stringify({ address: '456 New St' })
      });

      const updateCall = db.update.mock.calls[0][2];
      expect(updateCall.address).toBe('456 New St');
    });
  });
});

describe('notifications handler - edge cases', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('list - strips keys', () => {
    test('strips PK, SK, GSI1PK, GSI1SK from notifications', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.query.mockResolvedValue({
        items: [{
          PK: 'COMPANY#comp-1',
          SK: 'NOTIF#1',
          GSI1PK: 'something',
          GSI1SK: 'something',
          id: 'n1',
          title: 'Test',
          read: false
        }]
      });

      const result = await notifications.list({});
      const body = JSON.parse(result.body);

      expect(body.notifications[0].PK).toBeUndefined();
      expect(body.notifications[0].SK).toBeUndefined();
      expect(body.notifications[0].GSI1PK).toBeUndefined();
      expect(body.notifications[0].GSI1SK).toBeUndefined();
      expect(body.notifications[0].id).toBe('n1');
    });
  });

  describe('markRead - specific ids', () => {
    test('ignores ids that do not match any notification', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.query.mockResolvedValue({
        items: [
          { PK: 'COMPANY#comp-1', SK: 'NOTIF#1', id: 'n1', read: false }
        ]
      });
      db.update.mockResolvedValue({});

      const result = await notifications.markRead({
        body: JSON.stringify({ ids: ['nonexistent-id'] })
      });
      const body = JSON.parse(result.body);

      expect(body.marked).toBe(0);
      expect(db.update).not.toHaveBeenCalled();
    });

    test('does not re-mark already read notifications', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.query.mockResolvedValue({
        items: [
          { PK: 'COMPANY#comp-1', SK: 'NOTIF#1', id: 'n1', read: true }
        ]
      });
      db.update.mockResolvedValue({});

      const result = await notifications.markRead({
        body: JSON.stringify({ ids: ['n1'] })
      });
      const body = JSON.parse(result.body);

      expect(body.marked).toBe(0);
      expect(db.update).not.toHaveBeenCalled();
    });

    test('marks only matching unread notifications', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.query.mockResolvedValue({
        items: [
          { PK: 'COMPANY#comp-1', SK: 'NOTIF#1', id: 'n1', read: false },
          { PK: 'COMPANY#comp-1', SK: 'NOTIF#2', id: 'n2', read: false },
          { PK: 'COMPANY#comp-1', SK: 'NOTIF#3', id: 'n3', read: true }
        ]
      });
      db.update.mockResolvedValue({});

      const result = await notifications.markRead({
        body: JSON.stringify({ ids: ['n1', 'n3'] })
      });
      const body = JSON.parse(result.body);

      expect(body.marked).toBe(1); // only n1 (n3 already read)
      expect(db.update).toHaveBeenCalledTimes(1);
    });
  });

  describe('markRead - all', () => {
    test('returns 0 when no unread notifications', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.query.mockResolvedValue({
        items: [
          { PK: 'COMPANY#comp-1', SK: 'NOTIF#1', id: 'n1', read: true },
          { PK: 'COMPANY#comp-1', SK: 'NOTIF#2', id: 'n2', read: true }
        ]
      });

      const result = await notifications.markRead({
        body: JSON.stringify({ all: true })
      });
      const body = JSON.parse(result.body);

      expect(body.marked).toBe(0);
      expect(db.update).not.toHaveBeenCalled();
    });

    test('handles empty notification list', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.query.mockResolvedValue({ items: [] });

      const result = await notifications.markRead({
        body: JSON.stringify({ all: true })
      });
      const body = JSON.parse(result.body);
      expect(body.marked).toBe(0);
    });
  });

  describe('markRead - missing body', () => {
    test('handles null body', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      const result = await notifications.markRead({ body: null });
      expect(result.statusCode).toBe(400);
    });
  });
});
