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

const db = require('../handlers/lib/dynamo');
const auth = require('../handlers/lib/auth');
const notifications = require('../handlers/notifications');

describe('notifications handler', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('list', () => {
    test('returns notifications with unread count', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.query.mockResolvedValue({
        items: [
          { PK: 'COMPANY#comp-1', SK: 'NOTIF#1', id: 'n1', title: 'Approved', read: false },
          { PK: 'COMPANY#comp-1', SK: 'NOTIF#2', id: 'n2', title: 'New member', read: true },
          { PK: 'COMPANY#comp-1', SK: 'NOTIF#3', id: 'n3', title: 'Changes', read: false }
        ]
      });

      const result = await notifications.list({});
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.notifications).toHaveLength(3);
      expect(body.unreadCount).toBe(2);
      expect(body.notifications[0].PK).toBeUndefined();
    });

    test('returns empty when no notifications', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.query.mockResolvedValue({ items: [] });

      const result = await notifications.list({});
      const body = JSON.parse(result.body);

      expect(body.notifications).toHaveLength(0);
      expect(body.unreadCount).toBe(0);
    });

    test('returns 403 when no auth', async () => {
      auth.getCompanyId.mockResolvedValue(null);
      const result = await notifications.list({});
      expect(result.statusCode).toBe(403);
    });
  });

  describe('markRead', () => {
    test('marks all as read', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.query.mockResolvedValue({
        items: [
          { PK: 'COMPANY#comp-1', SK: 'NOTIF#1', read: false },
          { PK: 'COMPANY#comp-1', SK: 'NOTIF#2', read: false },
          { PK: 'COMPANY#comp-1', SK: 'NOTIF#3', read: true }
        ]
      });
      db.update.mockResolvedValue({});

      const result = await notifications.markRead({
        body: JSON.stringify({ all: true })
      });
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.marked).toBe(2);
      expect(db.update).toHaveBeenCalledTimes(2);
    });

    test('marks specific ids as read', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.query.mockResolvedValue({
        items: [
          { PK: 'COMPANY#comp-1', SK: 'NOTIF#1', id: 'n1', read: false },
          { PK: 'COMPANY#comp-1', SK: 'NOTIF#2', id: 'n2', read: false }
        ]
      });
      db.update.mockResolvedValue({});

      const result = await notifications.markRead({
        body: JSON.stringify({ ids: ['n1'] })
      });
      const body = JSON.parse(result.body);

      expect(body.marked).toBe(1);
      expect(db.update).toHaveBeenCalledTimes(1);
    });

    test('returns 400 for invalid body', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');

      const result = await notifications.markRead({
        body: JSON.stringify({})
      });
      expect(result.statusCode).toBe(400);
    });

    test('returns 403 when no auth', async () => {
      auth.getCompanyId.mockResolvedValue(null);
      const result = await notifications.markRead({ body: JSON.stringify({ all: true }) });
      expect(result.statusCode).toBe(403);
    });
  });
});
