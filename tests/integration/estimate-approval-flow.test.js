/**
 * Integration Test: Estimate → Share → Public View → Customer Approve
 *
 * Tests the full lifecycle of creating an estimate, sharing it with a customer,
 * the customer viewing it publicly, and responding with approval.
 */
const { MockDB } = require('../helpers/mock-db');
const mockDB = new MockDB();

// Wire up the shared mock DB
jest.mock('../../handlers/lib/dynamo', () => mockDB);

jest.mock('../../handlers/lib/auth', () => ({
  getUser: jest.fn(),
  getCompanyId: jest.fn()
}));

const auth = require('../../handlers/lib/auth');
const estimates = require('../../handlers/estimates');
const approval = require('../../handlers/approval');
const reports = require('../../handlers/reports');

describe('Integration: Estimate → Approval Flow', () => {
  const COMPANY_ID = 'comp-integ-1';
  const USER_SUB = 'user-sub-owner';

  beforeAll(() => {
    // Seed company and user records
    mockDB.seed([
      {
        PK: `COMPANY#${COMPANY_ID}`,
        SK: 'PROFILE',
        name: 'Integration Fencing Co',
        email: 'owner@integ.com',
        phone: '555-0001',
        subscriptionStatus: 'active',
        trialEndsAt: '2027-01-01T00:00:00.000Z',
        accentColor: '#c0622e',
        tagline: 'Test Fences'
      },
      {
        PK: `COMPANY#${COMPANY_ID}`,
        SK: `USER#${USER_SUB}`,
        GSI1PK: `USER#${USER_SUB}`,
        GSI1SK: `COMPANY#${COMPANY_ID}`,
        email: 'owner@integ.com',
        role: 'owner',
        createdAt: '2026-01-01T00:00:00.000Z'
      }
    ]);
  });

  beforeEach(() => {
    auth.getCompanyId.mockResolvedValue(COMPANY_ID);
    auth.getUser.mockReturnValue({ sub: USER_SUB, email: 'owner@integ.com' });
    approval._resetRateLimit();
  });

  let createdEstimateId;
  let shareToken;

  // Step 1: Create an estimate
  test('1. creates an estimate with active subscription', async () => {
    const result = await estimates.create({
      body: JSON.stringify({
        customerName: 'Alice Johnson',
        customerPhone: '555-9999',
        customerAddress: '100 Maple Ave',
        customerEmail: 'alice@example.com',
        fenceType: 'vinyl',
        fenceHeight: 6,
        fencePrice: 30,
        totalFeet: 150,
        totalCost: 4500,
        materialsCost: 3000,
        bom: [
          { name: 'Vinyl posts', qty: 20, unit: 'ea', unitCost: 25, total: 500 },
          { name: 'Vinyl panels', qty: 19, unit: 'ea', unitCost: 80, total: 1520 }
        ]
      })
    });

    expect(result.statusCode).toBe(201);
    const body = JSON.parse(result.body);
    expect(body.id).toBeDefined();
    expect(body.customerName).toBe('Alice Johnson');
    expect(body.fenceType).toBe('vinyl');
    expect(body.status).toBe('draft');
    expect(body.approvalStatus).toBe('draft');
    createdEstimateId = body.id;
  });

  // Step 2: Verify estimate appears in list
  test('2. estimate appears in list (not deleted)', async () => {
    const result = await estimates.list({ queryStringParameters: {} });
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    const found = body.estimates.find(e => e.id === createdEstimateId);
    expect(found).toBeDefined();
    expect(found.customerName).toBe('Alice Johnson');
    expect(found.PK).toBeUndefined(); // keys stripped
  });

  // Step 3: Get estimate by ID
  test('3. gets estimate by ID', async () => {
    const result = await estimates.get({
      pathParameters: { id: createdEstimateId }
    });

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.id).toBe(createdEstimateId);
    expect(body.totalCost).toBe(4500);
    expect(body.bom).toHaveLength(2);
  });

  // Step 4: Share estimate with customer
  test('4. shares estimate and gets share link', async () => {
    const result = await approval.share({
      pathParameters: { id: createdEstimateId },
      headers: { origin: 'https://fencetrace.com' }
    });

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.shareToken).toBeDefined();
    expect(body.link).toContain('approve.html?token=');
    shareToken = body.shareToken;
  });

  // Step 5: Re-sharing reuses existing token
  test('5. re-sharing reuses existing share token', async () => {
    const result = await approval.share({
      pathParameters: { id: createdEstimateId },
      headers: { origin: 'https://fencetrace.com' }
    });

    const body = JSON.parse(result.body);
    expect(body.shareToken).toBe(shareToken);
  });

  // Step 6: Customer views estimate publicly (no auth)
  test('6. customer views estimate via public link', async () => {
    const result = await approval.getPublic({
      pathParameters: { token: shareToken }
    });

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.customerName).toBe('Alice Johnson');
    expect(body.fenceType).toBe('vinyl');
    expect(body.totalCost).toBe(4500);
    expect(body.companyName).toBe('Integration Fencing Co');
    expect(body.approvalStatus).toBe('sent');
    // Internal keys should not be exposed
    expect(body.PK).toBeUndefined();
    expect(body.SK).toBeUndefined();
  });

  // Step 7: Customer requests changes
  test('7. customer requests changes', async () => {
    const result = await approval.respond({
      pathParameters: { token: shareToken },
      body: JSON.stringify({
        action: 'changes_requested',
        message: 'Can you use wood instead of vinyl?'
      })
    });

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.approvalStatus).toBe('changes_requested');
  });

  // Step 8: Verify approval history is tracked
  test('8. approval history has both sent and changes_requested entries', async () => {
    const result = await approval.getPublic({
      pathParameters: { token: shareToken }
    });

    const body = JSON.parse(result.body);
    expect(body.approvalStatus).toBe('changes_requested');
    expect(body.approvalHistory.length).toBeGreaterThanOrEqual(2);

    const actions = body.approvalHistory.map(h => h.action);
    expect(actions).toContain('sent');
    expect(actions).toContain('changes_requested');
  });

  // Step 9: Customer approves after changes
  test('9. customer approves the estimate', async () => {
    const result = await approval.respond({
      pathParameters: { token: shareToken },
      body: JSON.stringify({
        action: 'approved',
        message: 'Looks great now!'
      })
    });

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.approvalStatus).toBe('approved');
  });

  // Step 10: Verify final state via public link
  test('10. public view shows approved status with full history', async () => {
    const result = await approval.getPublic({
      pathParameters: { token: shareToken }
    });

    const body = JSON.parse(result.body);
    expect(body.approvalStatus).toBe('approved');
    expect(body.approvalHistory).toHaveLength(3);
    expect(body.approvalHistory[2].action).toBe('approved');
    expect(body.approvalHistory[2].message).toBe('Looks great now!');
  });

  // Step 11: Reports reflect the approved estimate
  test('11. dashboard includes the estimate in metrics', async () => {
    const result = await reports.dashboard({ queryStringParameters: {} });
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.totalEstimates).toBeGreaterThanOrEqual(1);
  });
});
