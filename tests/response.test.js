const res = require('../handlers/lib/response');

describe('response helpers', () => {
  describe('ok', () => {
    test('returns 200 with JSON body', () => {
      const result = res.ok({ foo: 'bar' });
      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body)).toEqual({ foo: 'bar' });
    });

    test('serializes arrays', () => {
      const result = res.ok([1, 2, 3]);
      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body)).toEqual([1, 2, 3]);
    });

    test('serializes nested objects', () => {
      const result = res.ok({ a: { b: { c: 1 } } });
      expect(JSON.parse(result.body).a.b.c).toBe(1);
    });
  });

  describe('created', () => {
    test('returns 201 with JSON body', () => {
      const result = res.created({ id: '123' });
      expect(result.statusCode).toBe(201);
      expect(JSON.parse(result.body)).toEqual({ id: '123' });
    });
  });

  describe('bad', () => {
    test('returns 400 with error message', () => {
      const result = res.bad('Invalid input');
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body)).toEqual({ error: 'Invalid input' });
    });

    test('handles undefined message', () => {
      const result = res.bad(undefined);
      expect(result.statusCode).toBe(400);
    });
  });

  describe('forbidden', () => {
    test('returns 403 with custom message', () => {
      const result = res.forbidden('No access');
      expect(result.statusCode).toBe(403);
      expect(JSON.parse(result.body)).toEqual({ error: 'No access' });
    });

    test('returns 403 with default message when no arg', () => {
      const result = res.forbidden();
      expect(result.statusCode).toBe(403);
      expect(JSON.parse(result.body)).toEqual({ error: 'Forbidden' });
    });
  });

  describe('notFound', () => {
    test('returns 404 with custom message', () => {
      const result = res.notFound('Item missing');
      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body)).toEqual({ error: 'Item missing' });
    });

    test('returns 404 with default message when no arg', () => {
      const result = res.notFound();
      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body)).toEqual({ error: 'Not found' });
    });
  });

  describe('error', () => {
    test('returns 500 with custom message', () => {
      const result = res.error('Server crash');
      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body)).toEqual({ error: 'Server crash' });
    });

    test('returns 500 with default message when no arg', () => {
      const result = res.error();
      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body)).toEqual({ error: 'Internal error' });
    });
  });

  describe('all responses are valid JSON', () => {
    test.each([
      ['ok', res.ok({ test: true })],
      ['created', res.created({ test: true })],
      ['bad', res.bad('err')],
      ['forbidden', res.forbidden()],
      ['notFound', res.notFound()],
      ['error', res.error()]
    ])('%s body is parseable JSON', (name, result) => {
      expect(() => JSON.parse(result.body)).not.toThrow();
    });
  });
});
