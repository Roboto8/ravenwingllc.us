/**
 * Additional edge case tests for response helpers and auth lib
 */
const res = require('../handlers/lib/response');

describe('response helpers - edge cases', () => {
  describe('tooMany', () => {
    test('returns 429 with custom message', () => {
      const result = res.tooMany('Please wait before trying again');
      expect(result.statusCode).toBe(429);
      expect(JSON.parse(result.body)).toEqual({ error: 'Please wait before trying again' });
    });

    test('returns 429 with default message', () => {
      const result = res.tooMany();
      expect(result.statusCode).toBe(429);
      expect(JSON.parse(result.body)).toEqual({ error: 'Too many requests' });
    });
  });

  describe('serialization edge cases', () => {
    test('handles empty object', () => {
      const result = res.ok({});
      expect(JSON.parse(result.body)).toEqual({});
    });

    test('handles null body', () => {
      const result = res.ok(null);
      expect(result.body).toBe('null');
    });

    test('handles boolean body', () => {
      const result = res.ok(true);
      expect(result.body).toBe('true');
    });

    test('handles numeric body', () => {
      const result = res.ok(42);
      expect(result.body).toBe('42');
    });

    test('handles string body', () => {
      const result = res.ok('hello');
      expect(result.body).toBe('"hello"');
    });

    test('handles undefined values in objects (silently removed by JSON.stringify)', () => {
      const result = res.ok({ a: 1, b: undefined, c: 3 });
      const parsed = JSON.parse(result.body);
      expect(parsed).toEqual({ a: 1, c: 3 });
      expect(parsed.b).toBeUndefined();
    });

    test('handles deeply nested objects', () => {
      const deep = { a: { b: { c: { d: { e: 'deep' } } } } };
      const result = res.ok(deep);
      expect(JSON.parse(result.body).a.b.c.d.e).toBe('deep');
    });

    test('handles arrays with mixed types', () => {
      const result = res.ok([1, 'two', null, { three: 3 }]);
      const parsed = JSON.parse(result.body);
      expect(parsed).toEqual([1, 'two', null, { three: 3 }]);
    });

    test('handles special characters in error messages', () => {
      const result = res.bad('Error: "quotes" & <tags> \'apostrophes\'');
      const parsed = JSON.parse(result.body);
      expect(parsed.error).toBe('Error: "quotes" & <tags> \'apostrophes\'');
    });
  });

  describe('all status codes are correct', () => {
    test.each([
      ['ok', 200],
      ['created', 201],
      ['bad', 400],
      ['forbidden', 403],
      ['notFound', 404],
      ['tooMany', 429],
      ['error', 500]
    ])('%s returns %d', (method, code) => {
      const result = res[method](method === 'ok' || method === 'created' ? {} : 'msg');
      expect(result.statusCode).toBe(code);
    });
  });
});

describe('auth lib - edge cases', () => {
  const auth = require('../handlers/lib/auth');

  describe('getUser - various claim structures', () => {
    test('extracts sub and email from valid claims', () => {
      const user = auth.getUser({
        requestContext: {
          authorizer: {
            jwt: {
              claims: { sub: 'abc-123', email: 'user@test.com', name: 'extra' }
            }
          }
        }
      });
      expect(user.sub).toBe('abc-123');
      expect(user.email).toBe('user@test.com');
      // Should not include extra fields
      expect(user.name).toBeUndefined();
    });

    test('returns null for completely empty event', () => {
      expect(auth.getUser({})).toBeNull();
    });

    test('returns null for undefined event properties', () => {
      expect(auth.getUser({ requestContext: undefined })).toBeNull();
    });
  });

  describe('getCompanyId - edge cases', () => {
    test('returns null for unauthenticated request', async () => {
      const mockDb = { queryGSI: jest.fn() };
      const result = await auth.getCompanyId({}, mockDb);
      expect(result).toBeNull();
      expect(mockDb.queryGSI).not.toHaveBeenCalled();
    });

    test('extracts companyId from GSI1SK correctly', async () => {
      const mockDb = {
        queryGSI: jest.fn().mockResolvedValue([
          { GSI1SK: 'COMPANY#my-company-uuid-123' }
        ])
      };

      const event = {
        requestContext: {
          authorizer: { jwt: { claims: { sub: 'user-1', email: 'e@e.com' } } }
        }
      };

      const result = await auth.getCompanyId(event, mockDb);
      expect(result).toBe('my-company-uuid-123');
    });
  });
});
