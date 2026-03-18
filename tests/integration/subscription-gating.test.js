/**
 * Integration Test: Subscription Gating
 *
 * Tests that estimate creation is properly gated by subscription status:
 * trialing (active) → trialing (expired) → active → canceled → past_due
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
const company = require('../../handlers/company');

describe('Integration: Subscription Gating', () => {
  const COMPANY_ID = 'comp-billing-gate';

  beforeAll(() => {
    mockDB.seed([
      {
        PK: `COMPANY#${COMPANY_ID}`,
        SK: 'PROFILE',
        name: 'Billing Gate Co',
        email: 'test@billing.com',
        subscriptionStatus: 'trialing',
        trialEndsAt: new Date(Date.now() + 7 * 86400000).toISOString()
      }
    ]);
  });

  beforeEach(() => {
    auth.getCompanyId.mockResolvedValue(COMPANY_ID);
  });

  test('1. active trial allows estimate creation', async () => {
    const result = await estimates.create({
      body: JSON.stringify({ customerName: 'Trial Customer', fenceType: 'wood' })
    });
    expect(result.statusCode).toBe(201);
  });

  test('2. expired trial blocks estimate creation', async () => {
    // Expire the trial
    await mockDB.update(`COMPANY#${COMPANY_ID}`, 'PROFILE', {
      trialEndsAt: '2020-01-01T00:00:00.000Z'
    });

    const result = await estimates.create({
      body: JSON.stringify({ customerName: 'Blocked Customer' })
    });

    expect(result.statusCode).toBe(403);
    expect(JSON.parse(result.body).error).toContain('Trial expired');
  });

  test('3. active subscription allows creation', async () => {
    // Simulate webhook setting subscription to active
    await mockDB.update(`COMPANY#${COMPANY_ID}`, 'PROFILE', {
      subscriptionStatus: 'active',
      subscriptionId: 'sub_123'
    });

    const result = await estimates.create({
      body: JSON.stringify({ customerName: 'Paid Customer', fenceType: 'vinyl' })
    });
    expect(result.statusCode).toBe(201);
  });

  test('4. company profile reflects active subscription', async () => {
    const result = await company.get({});
    const body = JSON.parse(result.body);

    expect(body.subscriptionStatus).toBe('active');
  });

  test('5. canceled subscription blocks creation', async () => {
    await mockDB.update(`COMPANY#${COMPANY_ID}`, 'PROFILE', {
      subscriptionStatus: 'canceled',
      subscriptionId: ''
    });

    const result = await estimates.create({
      body: JSON.stringify({ customerName: 'Canceled Customer' })
    });
    expect(result.statusCode).toBe(403);
  });

  test('6. past_due subscription blocks creation', async () => {
    await mockDB.update(`COMPANY#${COMPANY_ID}`, 'PROFILE', {
      subscriptionStatus: 'past_due'
    });

    const result = await estimates.create({
      body: JSON.stringify({ customerName: 'Past Due Customer' })
    });
    expect(result.statusCode).toBe(403);
  });

  test('7. reactivated subscription allows creation again', async () => {
    await mockDB.update(`COMPANY#${COMPANY_ID}`, 'PROFILE', {
      subscriptionStatus: 'active',
      subscriptionId: 'sub_456'
    });

    const result = await estimates.create({
      body: JSON.stringify({ customerName: 'Reactivated Customer', fenceType: 'aluminum' })
    });
    expect(result.statusCode).toBe(201);
  });

  test('8. existing estimates still accessible when subscription lapses', async () => {
    // Cancel subscription
    await mockDB.update(`COMPANY#${COMPANY_ID}`, 'PROFILE', {
      subscriptionStatus: 'canceled'
    });

    // List should still work (read-only)
    const result = await estimates.list({ queryStringParameters: {} });
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.estimates.length).toBeGreaterThanOrEqual(1);
  });

  test('9. can still view individual estimate when canceled', async () => {
    const list = await estimates.list({ queryStringParameters: {} });
    const firstId = JSON.parse(list.body).estimates[0].id;

    const result = await estimates.get({ pathParameters: { id: firstId } });
    expect(result.statusCode).toBe(200);
  });
});
