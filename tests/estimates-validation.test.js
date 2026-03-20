/**
 * Tests for estimate input validation — covers the validateInput() function
 * and the totalCost numeric type requirement that caused the save bug.
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

describe('estimates - input validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.getCompanyId.mockResolvedValue('comp-1');
    db.get.mockResolvedValue({ subscriptionStatus: 'active' });
    db.put.mockImplementation(item => item);
  });

  // ===== totalCost must be a number (the save bug) =====
  describe('totalCost type validation', () => {
    test('coerces totalCost from currency string "$1,234" to number', async () => {
      const result = await estimates.create({
        body: JSON.stringify({ totalCost: '$1,234' })
      });
      expect(result.statusCode).toBe(201);
      expect(JSON.parse(result.body).totalCost).toBe(1234);
    });

    test('coerces totalCost from numeric string "2500.00" to number', async () => {
      const result = await estimates.create({
        body: JSON.stringify({ totalCost: '2500.00' })
      });
      expect(result.statusCode).toBe(201);
      expect(JSON.parse(result.body).totalCost).toBe(2500);
    });

    test('accepts totalCost as integer', async () => {
      const result = await estimates.create({
        body: JSON.stringify({ totalCost: 2500 })
      });
      expect(result.statusCode).toBe(201);
    });

    test('accepts totalCost as float', async () => {
      const result = await estimates.create({
        body: JSON.stringify({ totalCost: 2500.50 })
      });
      expect(result.statusCode).toBe(201);
      expect(JSON.parse(result.body).totalCost).toBe(2500.50);
    });

    test('accepts totalCost as zero', async () => {
      const result = await estimates.create({
        body: JSON.stringify({ totalCost: 0 })
      });
      expect(result.statusCode).toBe(201);
    });

    test('rejects totalCost as Infinity (serialized as null)', async () => {
      // JSON.stringify(Infinity) => null, so it becomes null in the body
      const result = await estimates.create({
        body: JSON.stringify({ totalCost: Infinity })
      });
      // null is not a number, so it's rejected
      expect(result.statusCode).toBe(400);
    });

    test('rejects totalCost as NaN (serialized as null)', async () => {
      const result = await estimates.create({
        body: JSON.stringify({ totalCost: NaN })
      });
      expect(result.statusCode).toBe(400);
    });
  });

  // ===== All numeric fields =====
  describe('numeric field validation', () => {
    const numericFields = ['fencePrice', 'fenceHeight', 'terrainMultiplier', 'totalFeet', 'totalCost', 'materialsCost', 'mulchDepth'];

    test.each(numericFields)('%s rejects string value', async (field) => {
      const result = await estimates.create({
        body: JSON.stringify({ [field]: 'not-a-number' })
      });
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toContain(field + ' must be a number');
    });

    test.each(numericFields)('%s rejects boolean value', async (field) => {
      const result = await estimates.create({
        body: JSON.stringify({ [field]: true })
      });
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toContain(field + ' must be a number');
    });

    test.each(numericFields)('%s rejects Infinity (serialized as null)', async (field) => {
      // JSON.stringify(Infinity) => null, so parsed body has null
      const result = await estimates.create({
        body: JSON.stringify({ [field]: Infinity })
      });
      expect(result.statusCode).toBe(400);
    });

    test.each(numericFields)('%s accepts valid number', async (field) => {
      const result = await estimates.create({
        body: JSON.stringify({ [field]: 42 })
      });
      expect(result.statusCode).toBe(201);
    });
  });

  // ===== String field validation =====
  describe('string field validation', () => {
    const stringFields = ['customerName', 'customerPhone', 'customerAddress', 'customerEmail', 'fenceType', 'mulchMaterial', 'mulchDelivery'];

    test.each(stringFields)('%s rejects number value', async (field) => {
      const result = await estimates.create({
        body: JSON.stringify({ [field]: 12345 })
      });
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toContain(field + ' must be a string');
    });

    test.each(stringFields)('%s rejects value exceeding 500 chars', async (field) => {
      const result = await estimates.create({
        body: JSON.stringify({ [field]: 'x'.repeat(501) })
      });
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toContain('exceeds maximum length');
    });

    test.each(stringFields)('%s accepts value at 500 chars', async (field) => {
      const result = await estimates.create({
        body: JSON.stringify({ [field]: 'x'.repeat(500) })
      });
      expect(result.statusCode).toBe(201);
    });

    test.each(stringFields)('%s accepts empty string', async (field) => {
      const result = await estimates.create({
        body: JSON.stringify({ [field]: '' })
      });
      expect(result.statusCode).toBe(201);
    });
  });

  // ===== Array field validation =====
  describe('array field validation', () => {
    const arrayFields = ['fencePoints', 'gates', 'bom', 'sections', 'mulchAreas', 'photos'];

    test.each(arrayFields)('%s rejects non-array value', async (field) => {
      const result = await estimates.create({
        body: JSON.stringify({ [field]: 'not-an-array' })
      });
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toContain(field + ' must be an array');
    });

    test.each(arrayFields)('%s rejects object value', async (field) => {
      const result = await estimates.create({
        body: JSON.stringify({ [field]: { length: 5 } })
      });
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toContain(field + ' must be an array');
    });

    test.each(arrayFields)('%s accepts empty array', async (field) => {
      const result = await estimates.create({
        body: JSON.stringify({ [field]: [] })
      });
      expect(result.statusCode).toBe(201);
    });
  });

  // ===== Array size limits =====
  describe('array size limits', () => {
    test('rejects fencePoints exceeding 1000', async () => {
      const result = await estimates.create({
        body: JSON.stringify({ fencePoints: new Array(1001).fill([0, 0]) })
      });
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toContain('Too many fence points');
    });

    test('accepts fencePoints at exactly 1000', async () => {
      const result = await estimates.create({
        body: JSON.stringify({ fencePoints: new Array(1000).fill([0, 0]) })
      });
      expect(result.statusCode).toBe(201);
    });

    test('rejects gates exceeding 100', async () => {
      const result = await estimates.create({
        body: JSON.stringify({ gates: new Array(101).fill({}) })
      });
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toContain('Too many gates');
    });

    test('rejects bom exceeding 500', async () => {
      const result = await estimates.create({
        body: JSON.stringify({ bom: new Array(501).fill({}) })
      });
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toContain('Too many BOM items');
    });

    test('rejects sections exceeding 50', async () => {
      const result = await estimates.create({
        body: JSON.stringify({ sections: new Array(51).fill({}) })
      });
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toContain('Too many sections');
    });

    test('rejects mulchAreas exceeding 100', async () => {
      const result = await estimates.create({
        body: JSON.stringify({ mulchAreas: new Array(101).fill({}) })
      });
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toContain('Too many mulch areas');
    });

    test('rejects photos exceeding 50', async () => {
      const result = await estimates.create({
        body: JSON.stringify({ photos: new Array(51).fill({}) })
      });
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toContain('Too many photos');
    });
  });

  // ===== Enum validation =====
  describe('status enum validation', () => {
    test('rejects invalid approvalStatus', async () => {
      const result = await estimates.create({
        body: JSON.stringify({ approvalStatus: 'pending' })
      });
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toContain('Invalid approval status');
    });

    test.each(['draft', 'sent', 'approved', 'declined'])('accepts approvalStatus "%s"', async (status) => {
      const result = await estimates.create({
        body: JSON.stringify({ approvalStatus: status })
      });
      expect(result.statusCode).toBe(201);
    });

    test('rejects invalid status on update', async () => {
      db.findById.mockResolvedValue({
        PK: 'COMPANY#comp-1', SK: 'EST#2025-01-01#est-1', id: 'est-1'
      });
      db.update.mockResolvedValue({});

      const result = await estimates.update({
        pathParameters: { id: 'est-1' },
        body: JSON.stringify({ status: 'archived' })
      });
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toContain('Invalid status');
    });

    test.each(['draft', 'sent', 'approved', 'declined', 'deleted'])('accepts status "%s" on update', async (status) => {
      db.findById.mockResolvedValue({
        PK: 'COMPANY#comp-1', SK: 'EST#2025-01-01#est-1', id: 'est-1'
      });
      db.update.mockResolvedValue({});

      const result = await estimates.update({
        pathParameters: { id: 'est-1' },
        body: JSON.stringify({ status })
      });
      expect(result.statusCode).toBe(200);
    });
  });

  // ===== Invalid JSON =====
  describe('malformed input', () => {
    test('rejects invalid JSON body', async () => {
      const result = await estimates.create({ body: 'not json' });
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toContain('Invalid JSON');
    });

    test('rejects invalid JSON on update', async () => {
      db.findById.mockResolvedValue({
        PK: 'COMPANY#comp-1', SK: 'EST#2025-01-01#est-1', id: 'est-1'
      });

      const result = await estimates.update({
        pathParameters: { id: 'est-1' },
        body: '{broken'
      });
      expect(result.statusCode).toBe(400);
    });
  });

  // ===== Solo tier estimate limit =====
  describe('solo tier limit', () => {
    test('blocks create at 20 active estimates on solo', async () => {
      db.get.mockResolvedValue({ subscriptionStatus: 'active', tier: 'solo' });
      const twentyEstimates = Array.from({ length: 20 }, (_, i) => ({
        id: 'est-' + i, status: 'draft'
      }));
      db.query.mockResolvedValue({ items: twentyEstimates });

      const result = await estimates.create({ body: '{}' });
      expect(result.statusCode).toBe(403);
      expect(JSON.parse(result.body).error).toContain('Solo plan limit');
    });

    test('allows create when deleted estimates bring active count under 20', async () => {
      db.get.mockResolvedValue({ subscriptionStatus: 'active', tier: 'solo' });
      const items = [
        ...Array.from({ length: 19 }, (_, i) => ({ id: 'est-' + i, status: 'draft' })),
        { id: 'est-del', status: 'deleted' }
      ];
      db.query.mockResolvedValue({ items });

      const result = await estimates.create({ body: '{}' });
      expect(result.statusCode).toBe(201);
    });

    test('does not enforce limit for pro tier', async () => {
      db.get.mockResolvedValue({ subscriptionStatus: 'active', tier: 'pro' });

      const result = await estimates.create({ body: '{}' });
      expect(result.statusCode).toBe(201);
      // Should not even query for estimate count
      expect(db.query).not.toHaveBeenCalled();
    });

    test('does not enforce limit for team tier', async () => {
      db.get.mockResolvedValue({ subscriptionStatus: 'active', tier: 'team' });

      const result = await estimates.create({ body: '{}' });
      expect(result.statusCode).toBe(201);
      expect(db.query).not.toHaveBeenCalled();
    });
  });

  // ===== Trash - server-side filtered =====
  describe('trash - server-side filtered', () => {
    test('uses queryFiltered to return only deleted estimates', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.queryFiltered = jest.fn().mockResolvedValue({
        items: [{ id: 'e2', status: 'deleted', PK: 'x', SK: 'y' }],
        nextKey: null
      });

      const result = await estimates.trash({});
      const body = JSON.parse(result.body);

      expect(db.queryFiltered).toHaveBeenCalledTimes(1);
      expect(db.queryFiltered).toHaveBeenCalledWith(
        'COMPANY#comp-1', 'EST#',
        '#s = :del', { ':del': 'deleted' },
        50, undefined, { '#s': 'status' }
      );
      expect(body.estimates).toHaveLength(1);
      expect(body.estimates[0].id).toBe('e2');
      expect(body.estimates[0].PK).toBeUndefined();
    });

    test('passes pagination params from query string', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.queryFiltered = jest.fn().mockResolvedValue({
        items: [],
        nextKey: null
      });

      const result = await estimates.trash({
        queryStringParameters: { limit: '10', cursor: 'abc123' }
      });
      const body = JSON.parse(result.body);

      expect(db.queryFiltered).toHaveBeenCalledWith(
        'COMPANY#comp-1', 'EST#',
        '#s = :del', { ':del': 'deleted' },
        10, 'abc123', { '#s': 'status' }
      );
      expect(body.estimates).toHaveLength(0);
      expect(body.cursor).toBeNull();
    });
  });
});
