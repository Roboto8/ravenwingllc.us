/**
 * Integration Test: Reports Dashboard with Real Data
 *
 * Tests that the dashboard correctly computes metrics from estimates
 * across different statuses, fence types, and time periods.
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

describe('Integration: Reports Dashboard', () => {
  const COMPANY_ID = 'comp-reports-integ';

  beforeAll(() => {
    mockDB.seed([
      {
        PK: `COMPANY#${COMPANY_ID}`,
        SK: 'PROFILE',
        name: 'Reports Co',
        email: 'test@reports.com',
        subscriptionStatus: 'active',
        tier: 'contractor'
      }
    ]);
  });

  beforeEach(() => {
    auth.getCompanyId.mockResolvedValue(COMPANY_ID);
  });

  // Create several estimates with different statuses and types
  test('1. create estimates with various statuses and types', async () => {
    const estimateData = [
      { customerName: 'A', fenceType: 'wood', totalCost: 1000 },
      { customerName: 'B', fenceType: 'wood', totalCost: 2000 },
      { customerName: 'C', fenceType: 'vinyl', totalCost: 3000 },
      { customerName: 'D', fenceType: 'chain-link', totalCost: 1500 },
      { customerName: 'E', fenceType: 'aluminum', totalCost: 4000 },
    ];

    for (const data of estimateData) {
      const result = await estimates.create({ body: JSON.stringify(data) });
      expect(result.statusCode).toBe(201);
    }
  });

  test('2. dashboard shows 5 draft estimates', async () => {
    const result = await reports.dashboard({ queryStringParameters: {} });
    const body = JSON.parse(result.body);

    expect(body.totalEstimates).toBe(5);
    expect(body.estimatesByStatus.draft).toBe(5);
    expect(body.totalRevenue).toBe(0); // none approved yet
    expect(body.conversionRate).toBe(0);
  });

  test('3. update some estimates to sent/approved status', async () => {
    const list = await estimates.list({ queryStringParameters: {} });
    const ests = JSON.parse(list.body).estimates;

    // Mark customer A as sent
    await estimates.update({
      pathParameters: { id: ests.find(e => e.customerName === 'A').id },
      body: JSON.stringify({ status: 'sent' })
    });

    // Mark customer B as approved
    await estimates.update({
      pathParameters: { id: ests.find(e => e.customerName === 'B').id },
      body: JSON.stringify({ status: 'approved' })
    });

    // Mark customer C as approved
    await estimates.update({
      pathParameters: { id: ests.find(e => e.customerName === 'C').id },
      body: JSON.stringify({ status: 'approved' })
    });

    // Mark customer D as declined
    await estimates.update({
      pathParameters: { id: ests.find(e => e.customerName === 'D').id },
      body: JSON.stringify({ status: 'declined' })
    });
  });

  test('4. dashboard reflects updated statuses', async () => {
    const result = await reports.dashboard({ queryStringParameters: {} });
    const body = JSON.parse(result.body);

    expect(body.totalEstimates).toBe(5);
    expect(body.estimatesByStatus.draft).toBe(1);
    expect(body.estimatesByStatus.sent).toBe(1);
    expect(body.estimatesByStatus.approved).toBe(2);
    expect(body.estimatesByStatus.declined).toBe(1);
  });

  test('5. revenue only counts approved estimates', async () => {
    const result = await reports.dashboard({ queryStringParameters: {} });
    const body = JSON.parse(result.body);

    // B=$2000 + C=$3000 = $5000
    expect(body.totalRevenue).toBe(5000);
  });

  test('6. conversion rate counts sent+approved+declined in denominator', async () => {
    const result = await reports.dashboard({ queryStringParameters: {} });
    const body = JSON.parse(result.body);

    // Sent set: sent(1) + approved(2) + declined(1) = 4
    // Approved: 2
    // Rate: 2/4 = 50%
    expect(body.conversionRate).toBe(50);
  });

  test('7. average estimate value includes all estimates', async () => {
    const result = await reports.dashboard({ queryStringParameters: {} });
    const body = JSON.parse(result.body);

    // (1000+2000+3000+1500+4000)/5 = 2300
    expect(body.averageEstimateValue).toBe(2300);
  });

  test('8. top materials shows correct counts', async () => {
    const result = await reports.dashboard({ queryStringParameters: {} });
    const body = JSON.parse(result.body);

    expect(body.topMaterials[0]).toEqual({ material: 'wood', count: 2 });
    expect(body.topMaterials.find(m => m.material === 'vinyl').count).toBe(1);
    expect(body.topMaterials.find(m => m.material === 'chain-link').count).toBe(1);
    expect(body.topMaterials.find(m => m.material === 'aluminum').count).toBe(1);
  });

  test('9. soft-deleted estimates excluded from dashboard', async () => {
    // Delete customer E
    const list = await estimates.list({ queryStringParameters: {} });
    const estE = JSON.parse(list.body).estimates.find(e => e.customerName === 'E');

    await estimates.remove({ pathParameters: { id: estE.id } });

    const result = await reports.dashboard({ queryStringParameters: {} });
    const body = JSON.parse(result.body);

    expect(body.totalEstimates).toBe(4); // was 5, now 4
    expect(body.topMaterials.find(m => m.material === 'aluminum')).toBeUndefined();
  });

  test('10. estimates by month groups correctly', async () => {
    const result = await reports.dashboard({ queryStringParameters: {} });
    const body = JSON.parse(result.body);

    expect(body.estimatesByMonth.length).toBeGreaterThanOrEqual(1);
    // All created in same session, so all same month
    expect(body.estimatesByMonth[0].count).toBe(4);
  });
});
