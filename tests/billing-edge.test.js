/**
 * Additional edge case tests for billing handler
 */
jest.mock('../handlers/lib/dynamo', () => ({
  get: jest.fn(),
  put: jest.fn(),
  update: jest.fn(),
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

const mockStripe = {
  customers: { create: jest.fn() },
  checkout: { sessions: { create: jest.fn() } },
  billingPortal: { sessions: { create: jest.fn() } },
  subscriptions: { retrieve: jest.fn() }
};

jest.mock('stripe', () => jest.fn().mockReturnValue(mockStripe));

const db = require('../handlers/lib/dynamo');
const auth = require('../handlers/lib/auth');
const billing = require('../handlers/billing');

describe('billing handler - edge cases', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = 'sk_test_xxx';
    process.env.STRIPE_PRICE_ID = 'price_test_xxx';
    Object.keys(billing._checkoutTimestamps).forEach(k => delete billing._checkoutTimestamps[k]);
  });

  // ===== STATUS - past_due treated as active for billing =====
  describe('status - past_due subscription', () => {
    test('past_due status returns active=true', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.get.mockResolvedValue({
        subscriptionStatus: 'past_due',
        trialEndsAt: '2025-01-01T00:00:00.000Z'
      });

      const result = await billing.status({});
      const body = JSON.parse(result.body);

      expect(body.status).toBe('past_due');
      expect(body.active).toBe(true);
    });

    test('past_due can still cancel', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.get.mockResolvedValue({
        subscriptionStatus: 'past_due',
        trialEndsAt: '2025-01-01T00:00:00.000Z'
      });

      const result = await billing.status({});
      const body = JSON.parse(result.body);

      expect(body.canCancel).toBe(true);
    });
  });

  // ===== EXPORT DATA - edge cases =====
  describe('exportData - edge cases', () => {
    test('strips GSI keys from exported estimates', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.get.mockResolvedValue({
        name: 'Test Co', email: 'test@co.com',
        phone: '555-0000', address: '123 Main'
      });
      db.query.mockResolvedValue({
        items: [{
          PK: 'COMPANY#comp-1',
          SK: 'EST#1',
          GSI1PK: 'SHARE#token',
          GSI1SK: 'COMPANY#comp-1',
          id: 'est-1',
          customerName: 'Alice'
        }],
        nextKey: null
      });

      const result = await billing.exportData({});
      const body = JSON.parse(result.body);

      expect(body.estimates[0].PK).toBeUndefined();
      expect(body.estimates[0].SK).toBeUndefined();
      expect(body.estimates[0].GSI1PK).toBeUndefined();
      expect(body.estimates[0].GSI1SK).toBeUndefined();
      expect(body.estimates[0].id).toBe('est-1');
    });

    test('handles company with no estimates', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.get.mockResolvedValue({
        name: 'Empty Co', email: 'e@co.com',
        phone: '', address: ''
      });
      db.query.mockResolvedValue({ items: [], nextKey: null });

      const result = await billing.exportData({});
      const body = JSON.parse(result.body);

      expect(body.estimates).toEqual([]);
      expect(body.totalEstimates).toBe(0);
      expect(body.exportDate).toBeDefined();
    });

    test('includes exportDate as ISO string', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.get.mockResolvedValue({
        name: 'Co', email: 'e@co.com', phone: '', address: ''
      });
      db.query.mockResolvedValue({ items: [], nextKey: null });

      const before = new Date().toISOString();
      const result = await billing.exportData({});
      const after = new Date().toISOString();
      const body = JSON.parse(result.body);

      expect(body.exportDate >= before).toBe(true);
      expect(body.exportDate <= after).toBe(true);
    });
  });

  // ===== CHECKOUT - rate limit different companies =====
  describe('checkout - rate limiting per company', () => {
    test('different companies can checkout simultaneously', async () => {
      db.get.mockResolvedValue({
        email: 'test@co.com',
        stripeCustomerId: 'cus_existing',
        subscriptionStatus: 'trialing',
        trialEndsAt: new Date(Date.now() + 86400000).toISOString()
      });
      mockStripe.checkout.sessions.create.mockResolvedValue({ url: 'https://x.com' });

      // Company A
      auth.getCompanyId.mockResolvedValue('comp-a');
      const r1 = await billing.checkout({ body: '{}' });
      expect(r1.statusCode).toBe(200);

      // Company B (different) should not be rate limited
      auth.getCompanyId.mockResolvedValue('comp-b');
      const r2 = await billing.checkout({ body: '{}' });
      expect(r2.statusCode).toBe(200);
    });
  });

  // ===== STATUS - default tier =====
  describe('status - tier defaults', () => {
    test('returns contractor as default tier', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.get.mockResolvedValue({
        subscriptionStatus: 'active',
        trialEndsAt: '2025-01-01T00:00:00.000Z'
        // no tier field
      });

      const result = await billing.status({});
      const body = JSON.parse(result.body);

      expect(body.tier).toBe('contractor');
    });
  });

  // ===== CHECKOUT - Stripe session parameters =====
  describe('checkout - session configuration', () => {
    test('sets mode to subscription', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.get.mockResolvedValue({
        email: 'test@co.com',
        stripeCustomerId: 'cus_1',
        subscriptionStatus: 'trialing',
        trialEndsAt: new Date(Date.now() + 86400000).toISOString()
      });
      mockStripe.checkout.sessions.create.mockResolvedValue({ url: 'https://x.com' });

      await billing.checkout({ body: '{}' });

      const args = mockStripe.checkout.sessions.create.mock.calls[0][0];
      expect(args.mode).toBe('subscription');
      expect(args.customer).toBe('cus_1');
    });

    test('includes client_reference_id with company and timestamp', async () => {
      auth.getCompanyId.mockResolvedValue('comp-test');
      db.get.mockResolvedValue({
        email: 'test@co.com',
        stripeCustomerId: 'cus_1',
        subscriptionStatus: 'trialing',
        trialEndsAt: new Date(Date.now() + 86400000).toISOString()
      });
      mockStripe.checkout.sessions.create.mockResolvedValue({ url: 'https://x.com' });

      await billing.checkout({ body: '{}' });

      const args = mockStripe.checkout.sessions.create.mock.calls[0][0];
      expect(args.client_reference_id).toMatch(/^comp-test_\d+$/);
    });
  });
});
