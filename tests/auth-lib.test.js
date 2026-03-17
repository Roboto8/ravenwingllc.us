const auth = require('../handlers/lib/auth');

describe('auth helper', () => {
  describe('getUser', () => {
    test('extracts sub and email from JWT claims', () => {
      const event = {
        requestContext: {
          authorizer: {
            jwt: {
              claims: {
                sub: 'user-123',
                email: 'test@example.com'
              }
            }
          }
        }
      };
      const user = auth.getUser(event);
      expect(user).toEqual({ sub: 'user-123', email: 'test@example.com' });
    });

    test('returns null when no requestContext', () => {
      expect(auth.getUser({})).toBeNull();
    });

    test('returns null when no authorizer', () => {
      expect(auth.getUser({ requestContext: {} })).toBeNull();
    });

    test('returns null when no jwt', () => {
      expect(auth.getUser({ requestContext: { authorizer: {} } })).toBeNull();
    });

    test('returns null when no claims', () => {
      expect(auth.getUser({ requestContext: { authorizer: { jwt: {} } } })).toBeNull();
    });
  });

  describe('getCompanyId', () => {
    const makeEvent = (sub, email) => ({
      requestContext: {
        authorizer: {
          jwt: { claims: { sub, email } }
        }
      }
    });

    test('returns companyId from GSI lookup', async () => {
      const mockDb = {
        queryGSI: jest.fn().mockResolvedValue([
          { GSI1SK: 'COMPANY#comp-abc', GSI1PK: 'USER#user-123' }
        ])
      };

      const companyId = await auth.getCompanyId(makeEvent('user-123', 'test@test.com'), mockDb);
      expect(companyId).toBe('comp-abc');
      expect(mockDb.queryGSI).toHaveBeenCalledWith('USER#user-123');
    });

    test('returns null when user not found in GSI', async () => {
      const mockDb = {
        queryGSI: jest.fn().mockResolvedValue([])
      };

      const companyId = await auth.getCompanyId(makeEvent('user-unknown', 'x@x.com'), mockDb);
      expect(companyId).toBeNull();
    });

    test('returns null when event has no auth', async () => {
      const mockDb = { queryGSI: jest.fn() };
      const companyId = await auth.getCompanyId({}, mockDb);
      expect(companyId).toBeNull();
      expect(mockDb.queryGSI).not.toHaveBeenCalled();
    });

    test('handles multiple GSI results (takes first)', async () => {
      const mockDb = {
        queryGSI: jest.fn().mockResolvedValue([
          { GSI1SK: 'COMPANY#comp-first' },
          { GSI1SK: 'COMPANY#comp-second' }
        ])
      };

      const companyId = await auth.getCompanyId(makeEvent('user-1', 'a@a.com'), mockDb);
      expect(companyId).toBe('comp-first');
    });
  });
});
