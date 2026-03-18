/**
 * Integration Test: Multi-Company Data Isolation
 *
 * Verifies that two companies cannot see or modify each other's data.
 * This is critical for multi-tenant SaaS security.
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

describe('Integration: Multi-Company Data Isolation', () => {
  const COMPANY_A = 'comp-alpha';
  const COMPANY_B = 'comp-beta';

  beforeAll(() => {
    mockDB.seed([
      {
        PK: `COMPANY#${COMPANY_A}`,
        SK: 'PROFILE',
        name: 'Alpha Fencing',
        email: 'alpha@test.com',
        subscriptionStatus: 'active',
        trialEndsAt: '2027-01-01T00:00:00.000Z'
      },
      {
        PK: `COMPANY#${COMPANY_B}`,
        SK: 'PROFILE',
        name: 'Beta Fencing',
        email: 'beta@test.com',
        subscriptionStatus: 'active',
        trialEndsAt: '2027-01-01T00:00:00.000Z'
      }
    ]);
  });

  let alphaEstId, betaEstId;

  test('1. company A creates an estimate', async () => {
    auth.getCompanyId.mockResolvedValue(COMPANY_A);

    const result = await estimates.create({
      body: JSON.stringify({
        customerName: 'Alpha Customer',
        fenceType: 'wood',
        totalCost: 5000
      })
    });
    expect(result.statusCode).toBe(201);
    alphaEstId = JSON.parse(result.body).id;
  });

  test('2. company B creates an estimate', async () => {
    auth.getCompanyId.mockResolvedValue(COMPANY_B);

    const result = await estimates.create({
      body: JSON.stringify({
        customerName: 'Beta Customer',
        fenceType: 'vinyl',
        totalCost: 8000
      })
    });
    expect(result.statusCode).toBe(201);
    betaEstId = JSON.parse(result.body).id;
  });

  test('3. company A only sees its own estimates', async () => {
    auth.getCompanyId.mockResolvedValue(COMPANY_A);

    const result = await estimates.list({ queryStringParameters: {} });
    const body = JSON.parse(result.body);

    expect(body.estimates).toHaveLength(1);
    expect(body.estimates[0].customerName).toBe('Alpha Customer');
  });

  test('4. company B only sees its own estimates', async () => {
    auth.getCompanyId.mockResolvedValue(COMPANY_B);

    const result = await estimates.list({ queryStringParameters: {} });
    const body = JSON.parse(result.body);

    expect(body.estimates).toHaveLength(1);
    expect(body.estimates[0].customerName).toBe('Beta Customer');
  });

  test('5. company A cannot access company B estimate by ID', async () => {
    auth.getCompanyId.mockResolvedValue(COMPANY_A);

    const result = await estimates.get({
      pathParameters: { id: betaEstId }
    });
    expect(result.statusCode).toBe(404);
  });

  test('6. company B cannot access company A estimate by ID', async () => {
    auth.getCompanyId.mockResolvedValue(COMPANY_B);

    const result = await estimates.get({
      pathParameters: { id: alphaEstId }
    });
    expect(result.statusCode).toBe(404);
  });

  test('7. company A cannot update company B estimate', async () => {
    auth.getCompanyId.mockResolvedValue(COMPANY_A);

    const result = await estimates.update({
      pathParameters: { id: betaEstId },
      body: JSON.stringify({ customerName: 'HACKED' })
    });
    expect(result.statusCode).toBe(404);
  });

  test('8. company A cannot delete company B estimate', async () => {
    auth.getCompanyId.mockResolvedValue(COMPANY_A);

    const result = await estimates.remove({
      pathParameters: { id: betaEstId }
    });
    expect(result.statusCode).toBe(404);
  });

  test('9. company A dashboard only shows its own metrics', async () => {
    auth.getCompanyId.mockResolvedValue(COMPANY_A);

    const result = await reports.dashboard({ queryStringParameters: {} });
    const body = JSON.parse(result.body);

    expect(body.totalEstimates).toBe(1);
    expect(body.averageEstimateValue).toBe(5000);
    expect(body.topMaterials).toEqual([{ material: 'wood', count: 1 }]);
  });

  test('10. company B dashboard only shows its own metrics', async () => {
    auth.getCompanyId.mockResolvedValue(COMPANY_B);

    const result = await reports.dashboard({ queryStringParameters: {} });
    const body = JSON.parse(result.body);

    expect(body.totalEstimates).toBe(1);
    expect(body.averageEstimateValue).toBe(8000);
    expect(body.topMaterials).toEqual([{ material: 'vinyl', count: 1 }]);
  });

  test('11. company A trash is empty (has not deleted anything)', async () => {
    auth.getCompanyId.mockResolvedValue(COMPANY_A);

    const result = await estimates.trash({});
    expect(JSON.parse(result.body).estimates).toHaveLength(0);
  });

  test('12. deleting in company A does not affect company B', async () => {
    auth.getCompanyId.mockResolvedValue(COMPANY_A);
    await estimates.remove({ pathParameters: { id: alphaEstId } });

    // Company B should still have its estimate
    auth.getCompanyId.mockResolvedValue(COMPANY_B);
    const result = await estimates.get({ pathParameters: { id: betaEstId } });
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).customerName).toBe('Beta Customer');
  });

  test('13. unauthenticated requests are blocked', async () => {
    auth.getCompanyId.mockResolvedValue(null);

    const list = await estimates.list({ queryStringParameters: {} });
    expect(list.statusCode).toBe(403);

    const create = await estimates.create({ body: '{}' });
    expect(create.statusCode).toBe(403);

    const dashboard = await reports.dashboard({ queryStringParameters: {} });
    expect(dashboard.statusCode).toBe(403);
  });
});
