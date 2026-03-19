/**
 * Tests for recently added features:
 * - Solo tier estimate limit
 * - 90-day TTL on soft delete
 * - res.wrap() error handling
 * - Sections field in estimates
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

// ========== SOLO TIER ESTIMATE LIMIT ==========

describe('Solo tier estimate limit', () => {
  beforeEach(() => jest.clearAllMocks());

  const soloCompany = { tier: 'solo', subscriptionStatus: 'active', subscriptionId: 'sub_123' };
  const proCompany = { tier: 'pro', subscriptionStatus: 'active', subscriptionId: 'sub_456' };

  function makeCreateEvent() {
    return { body: JSON.stringify({ customerName: 'Test', fenceType: 'wood' }) };
  }

  function makeEstimates(count) {
    return Array.from({ length: count }, (_, i) => ({
      PK: 'COMPANY#comp-1', SK: 'EST#2025-01-' + i, id: 'est-' + i, status: 'draft'
    }));
  }

  test('blocks Solo user at 20 active estimates', async () => {
    auth.getCompanyId.mockResolvedValue('comp-1');
    db.get.mockResolvedValue(soloCompany);
    db.query.mockResolvedValue({ items: makeEstimates(20), nextKey: null });

    const result = await estimates.create(makeCreateEvent());
    expect(result.statusCode).toBe(403);
    expect(JSON.parse(result.body).error).toContain('Solo plan limit');
  });

  test('allows Solo user under 20 estimates', async () => {
    auth.getCompanyId.mockResolvedValue('comp-1');
    db.get.mockResolvedValue(soloCompany);
    db.query.mockResolvedValue({ items: makeEstimates(19), nextKey: null });
    db.put.mockResolvedValue({});

    const result = await estimates.create(makeCreateEvent());
    expect(result.statusCode).toBe(201);
  });

  test('does not count deleted estimates toward Solo limit', async () => {
    auth.getCompanyId.mockResolvedValue('comp-1');
    db.get.mockResolvedValue(soloCompany);
    const items = [
      ...makeEstimates(19),
      ...Array.from({ length: 5 }, (_, i) => ({
        PK: 'COMPANY#comp-1', SK: 'EST#del-' + i, id: 'del-' + i, status: 'deleted'
      }))
    ];
    db.query.mockResolvedValue({ items, nextKey: null });
    db.put.mockResolvedValue({});

    const result = await estimates.create(makeCreateEvent());
    expect(result.statusCode).toBe(201);
  });

  test('Pro tier has no estimate limit', async () => {
    auth.getCompanyId.mockResolvedValue('comp-1');
    db.get.mockResolvedValue(proCompany);
    db.put.mockResolvedValue({});

    const result = await estimates.create(makeCreateEvent());
    expect(db.query).not.toHaveBeenCalled();
    expect(result.statusCode).toBe(201);
  });
});

// ========== 90-DAY TTL ON SOFT DELETE ==========

describe('soft delete TTL', () => {
  beforeEach(() => jest.clearAllMocks());

  test('sets expiresAt to ~90 days as Unix timestamp', async () => {
    auth.getCompanyId.mockResolvedValue('comp-1');
    db.findById.mockResolvedValue({
      PK: 'COMPANY#comp-1', SK: 'EST#2025-01-01#est-1', id: 'est-1', status: 'draft'
    });
    db.update.mockResolvedValue({});

    const before = Math.floor(Date.now() / 1000);
    await estimates.remove({ pathParameters: { id: 'est-1' } });
    const after = Math.floor(Date.now() / 1000);

    const updateArgs = db.update.mock.calls[0][2];
    expect(updateArgs.status).toBe('deleted');
    expect(updateArgs.deletedAt).toBeDefined();
    expect(typeof updateArgs.expiresAt).toBe('number');

    const ninetyDays = 90 * 24 * 60 * 60;
    expect(updateArgs.expiresAt).toBeGreaterThanOrEqual(before + ninetyDays);
    expect(updateArgs.expiresAt).toBeLessThanOrEqual(after + ninetyDays);
  });

  test('restore clears expiresAt', async () => {
    auth.getCompanyId.mockResolvedValue('comp-1');
    db.findById.mockResolvedValue({
      PK: 'COMPANY#comp-1', SK: 'EST#2025-01-01#est-1', id: 'est-1',
      status: 'deleted', expiresAt: 9999999999
    });
    db.update.mockResolvedValue({});

    await estimates.restore({ pathParameters: { id: 'est-1' } });

    const updateArgs = db.update.mock.calls[0][2];
    expect(updateArgs.status).toBe('draft');
    expect(updateArgs.expiresAt).toBe(0);
  });
});

// ========== SECTIONS FIELD ==========

describe('sections field in estimates', () => {
  beforeEach(() => jest.clearAllMocks());

  test('create stores sections array', async () => {
    auth.getCompanyId.mockResolvedValue('comp-1');
    db.get.mockResolvedValue({ subscriptionStatus: 'active', subscriptionId: 'sub_1' });
    db.put.mockResolvedValue({});

    const sections = [
      { points: [[37.6, -77.3]], fenceType: 'wood', height: 6 },
      { points: [[37.7, -77.4]], fenceType: 'vinyl', height: 4 }
    ];
    await estimates.create({ body: JSON.stringify({ customerName: 'Test', sections }) });

    const putArg = db.put.mock.calls[0][0];
    expect(putArg.sections).toEqual(sections);
    expect(putArg.sections).toHaveLength(2);
  });

  test('update allows modifying sections', async () => {
    auth.getCompanyId.mockResolvedValue('comp-1');
    db.findById.mockResolvedValue({
      PK: 'COMPANY#comp-1', SK: 'EST#2025-01-01#est-1', id: 'est-1', sections: []
    });
    db.update.mockResolvedValue({});

    const newSections = [{ points: [[37.6, -77.3]], fenceType: 'chain-link', height: 8 }];
    await estimates.update({
      pathParameters: { id: 'est-1' },
      body: JSON.stringify({ sections: newSections })
    });

    const updateArgs = db.update.mock.calls[0][2];
    expect(updateArgs.sections).toEqual(newSections);
  });

  test('rejects more than 50 sections', async () => {
    auth.getCompanyId.mockResolvedValue('comp-1');
    db.get.mockResolvedValue({ subscriptionStatus: 'active', subscriptionId: 'sub_1' });

    const tooMany = Array.from({ length: 51 }, () => ({ points: [] }));
    const result = await estimates.create({ body: JSON.stringify({ sections: tooMany }) });

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toContain('Too many sections');
  });
});

// ========== res.wrap() ERROR HANDLING ==========

describe('res.wrap() error handling', () => {
  const res = require('../handlers/lib/response');

  test('catches synchronous errors and returns 500', async () => {
    const handler = res.wrap(async () => { throw new Error('Database exploded'); });
    const result = await handler({});
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body)).toEqual({ error: 'Internal error' });
  });

  test('catches async rejection and returns 500', async () => {
    const handler = res.wrap(async () => { await Promise.reject(new Error('Timeout')); });
    const result = await handler({});
    expect(result.statusCode).toBe(500);
  });

  test('does not leak error message to client', async () => {
    const handler = res.wrap(async () => { throw new Error('SECRET: stripe key is sk_live_xxx'); });
    const result = await handler({});
    const body = JSON.parse(result.body);
    expect(body.error).toBe('Internal error');
    expect(body.error).not.toContain('SECRET');
  });

  test('passes through successful responses unchanged', async () => {
    const handler = res.wrap(async () => ({ statusCode: 200, body: JSON.stringify({ ok: true }) }));
    const result = await handler({});
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ ok: true });
  });

  test('passes event to handler', async () => {
    let receivedEvent;
    const handler = res.wrap(async (event) => { receivedEvent = event; return { statusCode: 200, body: '{}' }; });
    await handler({ test: 'data' });
    expect(receivedEvent).toEqual({ test: 'data' });
  });

  test('includes security headers on error response', async () => {
    const handler = res.wrap(async () => { throw new Error('fail'); });
    const result = await handler({});
    expect(result.headers['X-Content-Type-Options']).toBe('nosniff');
    expect(result.headers['X-Frame-Options']).toBe('DENY');
  });

  test('logs error message to console', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const handler = res.wrap(async () => { throw new Error('test crash'); });
    await handler({});
    expect(spy).toHaveBeenCalledWith('Handler error:', 'test crash');
    spy.mockRestore();
  });
});
