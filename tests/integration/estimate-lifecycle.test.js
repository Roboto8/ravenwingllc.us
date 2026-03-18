/**
 * Integration Test: Estimate CRUD Lifecycle
 *
 * Tests create → update → soft delete → trash → restore → purge
 * and verifies list/trash filtering at each stage.
 */
const { MockDB } = require('../helpers/mock-db');
const mockDB = new MockDB();

jest.mock('../../handlers/lib/dynamo', () => mockDB);
jest.mock('../../handlers/lib/auth', () => ({
  getUser: jest.fn(),
  getCompanyId: jest.fn()
}));

jest.mock('../../handlers/roles', () => ({
  checkPermission: jest.fn().mockResolvedValue(true),
  ALL_PERMISSIONS: []
}));

const auth = require('../../handlers/lib/auth');
const estimates = require('../../handlers/estimates');
const reports = require('../../handlers/reports');

describe('Integration: Estimate CRUD Lifecycle', () => {
  const COMPANY_ID = 'comp-lifecycle';

  beforeAll(() => {
    mockDB.seed([
      {
        PK: `COMPANY#${COMPANY_ID}`,
        SK: 'PROFILE',
        name: 'Lifecycle Co',
        email: 'test@lifecycle.com',
        subscriptionStatus: 'active',
        trialEndsAt: '2027-01-01T00:00:00.000Z'
      }
    ]);
  });

  beforeEach(() => {
    auth.getCompanyId.mockResolvedValue(COMPANY_ID);
  });

  let estId;

  test('1. create estimate', async () => {
    const result = await estimates.create({
      body: JSON.stringify({
        customerName: 'Bob',
        fenceType: 'chain-link',
        fenceHeight: 4,
        totalCost: 1200
      })
    });

    expect(result.statusCode).toBe(201);
    const body = JSON.parse(result.body);
    estId = body.id;
    expect(body.status).toBe('draft');
    expect(body.fenceType).toBe('chain-link');
  });

  test('2. update estimate fields', async () => {
    const result = await estimates.update({
      pathParameters: { id: estId },
      body: JSON.stringify({
        customerName: 'Bob Updated',
        totalCost: 1500,
        fenceHeight: 6
      })
    });

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.customerName).toBe('Bob Updated');
    expect(body.totalCost).toBe(1500);
    expect(body.fenceHeight).toBe(6);
  });

  test('3. estimate shows in list', async () => {
    const result = await estimates.list({ queryStringParameters: {} });
    const body = JSON.parse(result.body);

    expect(body.estimates.some(e => e.id === estId)).toBe(true);
  });

  test('4. estimate not in trash yet', async () => {
    const result = await estimates.trash({});
    const body = JSON.parse(result.body);
    expect(body.estimates.some(e => e.id === estId)).toBe(false);
  });

  test('5. soft delete (move to trash)', async () => {
    const result = await estimates.remove({
      pathParameters: { id: estId }
    });

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).deleted).toBe(true);
  });

  test('6. deleted estimate disappears from list', async () => {
    const result = await estimates.list({ queryStringParameters: {} });
    const body = JSON.parse(result.body);
    expect(body.estimates.some(e => e.id === estId)).toBe(false);
  });

  test('7. deleted estimate appears in trash', async () => {
    const result = await estimates.trash({});
    const body = JSON.parse(result.body);
    expect(body.estimates.some(e => e.id === estId)).toBe(true);
  });

  test('8. restore from trash', async () => {
    const result = await estimates.restore({
      pathParameters: { id: estId }
    });

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.id).toBe(estId);
  });

  test('9. restored estimate back in list', async () => {
    const result = await estimates.list({ queryStringParameters: {} });
    const body = JSON.parse(result.body);
    expect(body.estimates.some(e => e.id === estId)).toBe(true);
  });

  test('10. restored estimate gone from trash', async () => {
    const result = await estimates.trash({});
    const body = JSON.parse(result.body);
    expect(body.estimates.some(e => e.id === estId)).toBe(false);
  });

  test('11. soft delete again for purge test', async () => {
    await estimates.remove({ pathParameters: { id: estId } });

    const trashResult = await estimates.trash({});
    expect(JSON.parse(trashResult.body).estimates.some(e => e.id === estId)).toBe(true);
  });

  test('12. purge permanently deletes', async () => {
    const result = await estimates.purge({
      pathParameters: { id: estId }
    });

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).purged).toBe(true);
  });

  test('13. purged estimate gone from everywhere', async () => {
    const list = await estimates.list({ queryStringParameters: {} });
    expect(JSON.parse(list.body).estimates.some(e => e.id === estId)).toBe(false);

    const trash = await estimates.trash({});
    expect(JSON.parse(trash.body).estimates.some(e => e.id === estId)).toBe(false);

    const get = await estimates.get({ pathParameters: { id: estId } });
    expect(get.statusCode).toBe(404);
  });

  test('14. dashboard reflects correct count after purge', async () => {
    const result = await reports.dashboard({ queryStringParameters: {} });
    const body = JSON.parse(result.body);

    // The purged estimate should not appear in any metrics
    expect(body.totalEstimates).toBe(0);
  });
});
