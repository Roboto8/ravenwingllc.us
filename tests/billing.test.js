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

// Mock stripe
const mockStripe = {
  customers: {
    create: jest.fn()
  },
  checkout: {
    sessions: {
      create: jest.fn()
    }
  },
  billingPortal: {
    sessions: {
      create: jest.fn()
    }
  },
  subscriptions: {
    retrieve: jest.fn()
  }
};

jest.mock('stripe', () => {
  return jest.fn().mockReturnValue(mockStripe);
});

const db = require('../handlers/lib/dynamo');
const auth = require('../handlers/lib/auth');
const billing = require('../handlers/billing');

describe('billing handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = 'sk_test_xxx';
    process.env.STRIPE_PRICE_ID = 'price_test_xxx';
    // Clear rate limit timestamps between tests
    Object.keys(billing._checkoutTimestamps).forEach(k => delete billing._checkoutTimestamps[k]);
  });

  const companyWithStripe = {
    email: 'billing@test.com',
    stripeCustomerId: 'cus_existing',
    subscriptionStatus: 'active',
    trialEndsAt: '2025-12-31T00:00:00.000Z'
  };

  const companyWithoutStripe = {
    email: 'new@test.com',
    stripeCustomerId: '',
    subscriptionStatus: 'free',
    tier: 'free'
  };

  // ===== CHECKOUT =====
  describe('checkout', () => {
    test('creates checkout session with existing Stripe customer', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.get.mockResolvedValue(companyWithStripe);
      mockStripe.checkout.sessions.create.mockResolvedValue({
        url: 'https://checkout.stripe.com/session123'
      });

      const result = await billing.checkout({
        body: JSON.stringify({ returnUrl: 'https://myapp.com/' })
      });
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.url).toBe('https://checkout.stripe.com/session123');
      expect(mockStripe.customers.create).not.toHaveBeenCalled();
      expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: 'cus_existing',
          mode: 'subscription'
        })
      );
    });

    test('creates new Stripe customer when none exists', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.get.mockResolvedValue(companyWithoutStripe);
      mockStripe.customers.create.mockResolvedValue({ id: 'cus_new' });
      mockStripe.checkout.sessions.create.mockResolvedValue({
        url: 'https://checkout.stripe.com/new'
      });

      const result = await billing.checkout({
        body: JSON.stringify({})
      });

      expect(mockStripe.customers.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'new@test.com',
          metadata: expect.objectContaining({ companyId: 'comp-1' })
        })
      );
      expect(db.update).toHaveBeenCalledWith(
        'COMPANY#comp-1', 'PROFILE',
        { stripeCustomerId: 'cus_new', GSI1PK: 'STRIPE#cus_new', GSI1SK: 'PROFILE' }
      );
      expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({ customer: 'cus_new' })
      );
    });

    test('uses default returnUrl when not provided', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.get.mockResolvedValue(companyWithStripe);
      mockStripe.checkout.sessions.create.mockResolvedValue({ url: 'https://x.com' });

      await billing.checkout({ body: '{}' });

      const sessionArg = mockStripe.checkout.sessions.create.mock.calls[0][0];
      expect(sessionArg.success_url).toContain('?billing=success');
      expect(sessionArg.cancel_url).toContain('?billing=cancel');
    });

    test('passes STRIPE_PRICE_ID as line item', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.get.mockResolvedValue(companyWithStripe);
      mockStripe.checkout.sessions.create.mockResolvedValue({ url: 'https://x.com' });

      await billing.checkout({ body: '{}' });

      const sessionArg = mockStripe.checkout.sessions.create.mock.calls[0][0];
      expect(sessionArg.line_items).toEqual([{ price: 'price_test_xxx', quantity: 1 }]);
    });

    test('returns 403 when no auth', async () => {
      auth.getCompanyId.mockResolvedValue(null);
      const result = await billing.checkout({ body: '{}' });
      expect(result.statusCode).toBe(403);
    });

    test('returns 404 when company not found', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.get.mockResolvedValue(undefined);

      const result = await billing.checkout({ body: '{}' });
      expect(result.statusCode).toBe(404);
    });
  });

  // ===== PORTAL =====
  describe('portal', () => {
    test('creates portal session', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.get.mockResolvedValue(companyWithStripe);
      mockStripe.billingPortal.sessions.create.mockResolvedValue({
        url: 'https://billing.stripe.com/portal123'
      });

      const result = await billing.portal({
        body: JSON.stringify({ returnUrl: 'https://fencetrace.com/settings' })
      });
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.url).toBe('https://billing.stripe.com/portal123');
      expect(mockStripe.billingPortal.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: 'cus_existing',
          return_url: 'https://fencetrace.com/settings'
        })
      );
    });

    test('returns 400 when no Stripe customer', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.get.mockResolvedValue({ stripeCustomerId: '' });

      const result = await billing.portal({ body: '{}' });
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toContain('No billing account');
    });

    test('returns 400 when company null', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.get.mockResolvedValue(null);

      const result = await billing.portal({ body: '{}' });
      expect(result.statusCode).toBe(400);
    });

    test('returns 403 when no auth', async () => {
      auth.getCompanyId.mockResolvedValue(null);
      const result = await billing.portal({ body: '{}' });
      expect(result.statusCode).toBe(403);
    });
  });

  // ===== STATUS =====
  describe('status', () => {
    test('returns active status', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.get.mockResolvedValue({
        subscriptionStatus: 'active',
        trialEndsAt: '2025-01-01T00:00:00.000Z'
      });

      const result = await billing.status({});
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.status).toBe('active');
      expect(body.active).toBe(true);
      expect(body.trialActive).toBe(false);
      expect(body.daysLeft).toBe(0);
    });

    test('returns free tier status', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.get.mockResolvedValue({
        subscriptionStatus: 'free',
        tier: 'free'
      });
      db.query.mockResolvedValue({ items: [] });

      const result = await billing.status({});
      const body = JSON.parse(result.body);

      expect(body.status).toBe('free');
      expect(body.active).toBe(true);
      expect(body.tier).toBe('free');
      expect(body.estimatesUsed).toBe(0);
      expect(body.estimateLimit).toBe(2);
    });

    test('returns canceled status', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.get.mockResolvedValue({
        subscriptionStatus: 'canceled',
        trialEndsAt: '2025-01-01T00:00:00.000Z'
      });
      db.query.mockResolvedValue({ items: [] });

      const result = await billing.status({});
      const body = JSON.parse(result.body);

      expect(body.status).toBe('canceled');
      expect(body.active).toBe(true);
      expect(body.tier).toBe('free');
    });

    test('returns 403 when no auth', async () => {
      auth.getCompanyId.mockResolvedValue(null);
      const result = await billing.status({});
      expect(result.statusCode).toBe(403);
    });

    test('returns 404 when company not found', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.get.mockResolvedValue(undefined);

      const result = await billing.status({});
      expect(result.statusCode).toBe(404);
    });

    test('returns billing info from Stripe when subscriptionId is present and active', async () => {
      process.env.STRIPE_PRICE_BUILDER = 'price_builder';

      auth.getCompanyId.mockResolvedValue('comp-1');
      db.get.mockResolvedValue({
        subscriptionStatus: 'active',
        subscriptionId: 'sub_123',
        trialEndsAt: '2025-01-01T00:00:00.000Z',
        tier: 'contractor'
      });

      mockStripe.subscriptions.retrieve.mockResolvedValue({
        current_period_end: 1735689600, // 2025-01-01
        items: {
          data: [{
            price: { id: 'price_contractor', unit_amount: 3500 }
          }]
        }
      });

      const result = await billing.status({});
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.nextBillingDate).toBeDefined();
      expect(body.planAmount).toBe(35);
      expect(body.tier).toBe('pro');
    });

    test('detects pro tier from Stripe builder price (legacy)', async () => {
      process.env.STRIPE_PRICE_BUILDER = 'price_builder';

      auth.getCompanyId.mockResolvedValue('comp-1');
      db.get.mockResolvedValue({
        subscriptionStatus: 'active',
        subscriptionId: 'sub_123',
        trialEndsAt: '2025-01-01T00:00:00.000Z'
      });

      mockStripe.subscriptions.retrieve.mockResolvedValue({
        current_period_end: 1735689600,
        items: {
          data: [{ price: { id: 'price_builder', unit_amount: 1500 } }]
        }
      });

      const result = await billing.status({});
      const body = JSON.parse(result.body);
      expect(body.tier).toBe('pro');
    });

    test('defaults to pro tier when price does not match known prices', async () => {
      process.env.STRIPE_PRICE_BUILDER = 'price_builder';

      auth.getCompanyId.mockResolvedValue('comp-1');
      db.get.mockResolvedValue({
        subscriptionStatus: 'active',
        subscriptionId: 'sub_456',
        trialEndsAt: '2025-01-01T00:00:00.000Z'
      });

      mockStripe.subscriptions.retrieve.mockResolvedValue({
        current_period_end: 1735689600,
        items: {
          data: [{ price: { id: 'price_unknown', unit_amount: 3500 } }]
        }
      });

      const result = await billing.status({});
      const body = JSON.parse(result.body);
      expect(body.tier).toBe('pro');
    });

    test('continues without billing info when Stripe call fails', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.get.mockResolvedValue({
        subscriptionStatus: 'active',
        subscriptionId: 'sub_bad',
        trialEndsAt: '2025-01-01T00:00:00.000Z'
      });

      mockStripe.subscriptions.retrieve.mockRejectedValue(new Error('Stripe down'));

      const result = await billing.status({});
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.nextBillingDate).toBeNull();
      expect(body.planAmount).toBeNull();
    });
  });

  // ===== CHECKOUT - sanitizeReturnUrl edge cases =====
  describe('checkout - sanitizeReturnUrl', () => {
    test('rejects invalid URL and uses default', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.get.mockResolvedValue(companyWithStripe);
      mockStripe.checkout.sessions.create.mockResolvedValue({ url: 'https://x.com' });

      await billing.checkout({
        body: JSON.stringify({ returnUrl: 'not-a-valid-url' })
      });

      const sessionArg = mockStripe.checkout.sessions.create.mock.calls[0][0];
      expect(sessionArg.success_url).toContain('ravenwingllc-frontend-dev');
    });

    test('returns 400 when no price configured', async () => {
      delete process.env.STRIPE_PRICE_ID;
      delete process.env.STRIPE_PRICE_CONTRACTOR;
      delete process.env.STRIPE_PRICE_BUILDER;

      auth.getCompanyId.mockResolvedValue('comp-1');
      db.get.mockResolvedValue(companyWithStripe);

      const result = await billing.checkout({
        body: JSON.stringify({ tier: 'builder' })
      });

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toContain('No price configured');
    });
  });

  // ===== CHECKOUT - tier selection =====
  describe('checkout - tier selection', () => {
    test('checkout with tier=builder uses STRIPE_PRICE_BUILDER', async () => {
      process.env.STRIPE_PRICE_BUILDER = 'price_builder_123';
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.get.mockResolvedValue(companyWithStripe);
      mockStripe.checkout.sessions.create.mockResolvedValue({ url: 'https://x.com' });

      await billing.checkout({
        body: JSON.stringify({ tier: 'builder' })
      });

      const sessionArg = mockStripe.checkout.sessions.create.mock.calls[0][0];
      expect(sessionArg.line_items).toEqual([{ price: 'price_builder_123', quantity: 1 }]);
    });

    test('checkout with tier=contractor uses STRIPE_PRICE_CONTRACTOR', async () => {
      process.env.STRIPE_PRICE_CONTRACTOR = 'price_contractor_789';
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.get.mockResolvedValue(companyWithStripe);
      mockStripe.checkout.sessions.create.mockResolvedValue({ url: 'https://x.com' });

      await billing.checkout({
        body: JSON.stringify({ tier: 'contractor' })
      });

      const sessionArg = mockStripe.checkout.sessions.create.mock.calls[0][0];
      expect(sessionArg.line_items).toEqual([{ price: 'price_contractor_789', quantity: 1 }]);
    });

    test('checkout defaults to contractor tier when no tier specified', async () => {
      process.env.STRIPE_PRICE_CONTRACTOR = 'price_contractor_default';
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.get.mockResolvedValue(companyWithStripe);
      mockStripe.checkout.sessions.create.mockResolvedValue({ url: 'https://x.com' });

      await billing.checkout({
        body: JSON.stringify({})
      });

      const sessionArg = mockStripe.checkout.sessions.create.mock.calls[0][0];
      expect(sessionArg.line_items).toEqual([{ price: 'price_contractor_default', quantity: 1 }]);
    });

    test('checkout falls back to STRIPE_PRICE_ID when tier price not set', async () => {
      delete process.env.STRIPE_PRICE_CONTRACTOR;
      delete process.env.STRIPE_PRICE_BUILDER;
      process.env.STRIPE_PRICE_ID = 'price_fallback';
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.get.mockResolvedValue(companyWithStripe);
      mockStripe.checkout.sessions.create.mockResolvedValue({ url: 'https://x.com' });

      await billing.checkout({
        body: JSON.stringify({})
      });

      const sessionArg = mockStripe.checkout.sessions.create.mock.calls[0][0];
      expect(sessionArg.line_items).toEqual([{ price: 'price_fallback', quantity: 1 }]);
    });

    test('checkout passes tier in customer metadata when creating new customer', async () => {
      process.env.STRIPE_PRICE_BUILDER = 'price_builder_123';
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.get.mockResolvedValue(companyWithoutStripe);
      mockStripe.customers.create.mockResolvedValue({ id: 'cus_new' });
      mockStripe.checkout.sessions.create.mockResolvedValue({ url: 'https://x.com' });

      await billing.checkout({
        body: JSON.stringify({ tier: 'builder' })
      });

      expect(mockStripe.customers.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({ tier: 'builder' })
        })
      );
    });
  });

  // ===== STATUS - tier in response =====
  describe('status - tier info', () => {
    test('returns tier info for free tier users', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.get.mockResolvedValue({
        subscriptionStatus: 'free',
        tier: 'free'
      });
      db.query.mockResolvedValue({ items: [] });

      const result = await billing.status({});
      const body = JSON.parse(result.body);

      expect(body.tier).toBe('free');
    });

    test('returns default free tier when no tier set and status is free', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.get.mockResolvedValue({
        subscriptionStatus: 'free'
      });
      db.query.mockResolvedValue({ items: [] });

      const result = await billing.status({});
      const body = JSON.parse(result.body);

      expect(body.tier).toBe('free');
    });

    test('returns canCancel true for active subscription', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.get.mockResolvedValue({
        subscriptionStatus: 'active',
        trialEndsAt: '2025-01-01T00:00:00.000Z'
      });

      const result = await billing.status({});
      const body = JSON.parse(result.body);

      expect(body.canCancel).toBe(true);
    });

    test('returns canCancel false for non-active subscription', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.get.mockResolvedValue({
        subscriptionStatus: 'canceled',
        trialEndsAt: '2025-01-01T00:00:00.000Z'
      });
      db.query.mockResolvedValue({ items: [] });

      const result = await billing.status({});
      const body = JSON.parse(result.body);

      expect(body.canCancel).toBe(false);
    });

    test('does not call Stripe when subscription is not active', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.get.mockResolvedValue({
        subscriptionStatus: 'canceled',
        subscriptionId: 'sub_123',
        trialEndsAt: '2025-01-01T00:00:00.000Z'
      });
      db.query.mockResolvedValue({ items: [] });

      const result = await billing.status({});
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(mockStripe.subscriptions.retrieve).not.toHaveBeenCalled();
      expect(body.nextBillingDate).toBeNull();
    });

    test('does not call Stripe when no subscriptionId', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.get.mockResolvedValue({
        subscriptionStatus: 'active',
        trialEndsAt: '2025-01-01T00:00:00.000Z'
      });

      const result = await billing.status({});
      expect(mockStripe.subscriptions.retrieve).not.toHaveBeenCalled();
    });
  });

  // ===== CHECKOUT - sanitizeReturnUrl additional =====
  describe('checkout - sanitizeReturnUrl edge cases', () => {
    test('accepts allowed https URLs', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.get.mockResolvedValue(companyWithStripe);
      mockStripe.checkout.sessions.create.mockResolvedValue({ url: 'https://x.com' });

      await billing.checkout({
        body: JSON.stringify({ returnUrl: 'https://fencetrace.com/dashboard' })
      });

      const sessionArg = mockStripe.checkout.sessions.create.mock.calls[0][0];
      expect(sessionArg.success_url).toContain('https://fencetrace.com/dashboard');
    });

    test('rejects unknown https URLs (open redirect prevention)', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.get.mockResolvedValue(companyWithStripe);
      mockStripe.checkout.sessions.create.mockResolvedValue({ url: 'https://x.com' });

      await billing.checkout({
        body: JSON.stringify({ returnUrl: 'https://evil.com/phish' })
      });

      const sessionArg = mockStripe.checkout.sessions.create.mock.calls[0][0];
      expect(sessionArg.success_url).not.toContain('evil.com');
    });

    test('handles null returnUrl', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.get.mockResolvedValue(companyWithStripe);
      mockStripe.checkout.sessions.create.mockResolvedValue({ url: 'https://x.com' });

      await billing.checkout({
        body: JSON.stringify({ returnUrl: null })
      });

      const sessionArg = mockStripe.checkout.sessions.create.mock.calls[0][0];
      expect(sessionArg.success_url).toContain('ravenwingllc-frontend-dev');
    });
  });

  // ===== CHECKOUT - double-charge prevention =====
  describe('checkout - double-charge prevention', () => {
    test('returns 400 if company already has active subscription', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.get.mockResolvedValue({
        email: 'billing@test.com',
        stripeCustomerId: 'cus_existing',
        subscriptionStatus: 'active',
        subscriptionId: 'sub_existing'
      });

      const result = await billing.checkout({ body: '{}' });
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toContain('already has an active subscription');
      expect(mockStripe.checkout.sessions.create).not.toHaveBeenCalled();
    });

    test('allows checkout when subscription is canceled', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.get.mockResolvedValue({
        email: 'billing@test.com',
        stripeCustomerId: 'cus_existing',
        subscriptionStatus: 'canceled',
        subscriptionId: ''
      });
      mockStripe.checkout.sessions.create.mockResolvedValue({ url: 'https://checkout.stripe.com/ok' });

      const result = await billing.checkout({ body: '{}' });
      expect(result.statusCode).toBe(200);
    });

    test('includes client_reference_id in checkout session', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.get.mockResolvedValue(companyWithStripe);
      mockStripe.checkout.sessions.create.mockResolvedValue({ url: 'https://x.com' });

      await billing.checkout({ body: '{}' });

      const sessionArg = mockStripe.checkout.sessions.create.mock.calls[0][0];
      expect(sessionArg.client_reference_id).toMatch(/^comp-1_\d+$/);
    });
  });

  // ===== CHECKOUT - rate limiting =====
  describe('checkout - rate limiting', () => {
    test('returns 429 if same company calls checkout within 10 seconds', async () => {
      auth.getCompanyId.mockResolvedValue('comp-rate');
      db.get.mockResolvedValue(companyWithStripe);
      mockStripe.checkout.sessions.create.mockResolvedValue({ url: 'https://x.com' });

      // First call should succeed
      const result1 = await billing.checkout({ body: '{}' });
      expect(result1.statusCode).toBe(200);

      // Second call within 10s should be rate limited
      const result2 = await billing.checkout({ body: '{}' });
      expect(result2.statusCode).toBe(429);
      expect(JSON.parse(result2.body).error).toContain('Please wait');
    });

    test('allows checkout after rate limit window passes', async () => {
      auth.getCompanyId.mockResolvedValue('comp-rate2');
      db.get.mockResolvedValue(companyWithStripe);
      mockStripe.checkout.sessions.create.mockResolvedValue({ url: 'https://x.com' });

      // First call
      await billing.checkout({ body: '{}' });

      // Simulate time passing by manipulating the timestamp
      billing._checkoutTimestamps['comp-rate2'] = Date.now() - 11000;

      // Should succeed now
      const result = await billing.checkout({ body: '{}' });
      expect(result.statusCode).toBe(200);
    });
  });

  // ===== PORTAL - edge cases =====
  describe('portal - edge cases', () => {
    test('returns 403 when no company found', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.get.mockResolvedValue(null);

      const result = await billing.portal({ body: '{}' });
      expect(result.statusCode).toBe(400);
    });
  });

  // ===== EXPORT DATA =====
  describe('exportData', () => {
    test('exports all company estimates', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.get.mockResolvedValue({
        name: 'Test Co',
        email: 'test@co.com',
        phone: '555-0000',
        address: '123 Main St'
      });
      db.query.mockResolvedValue({
        items: [
          { PK: 'COMPANY#comp-1', SK: 'EST#1', GSI1PK: 'x', GSI1SK: 'y', id: 'est-1', customerName: 'Alice' },
          { PK: 'COMPANY#comp-1', SK: 'EST#2', GSI1PK: 'x', GSI1SK: 'y', id: 'est-2', customerName: 'Bob' }
        ],
        nextKey: null
      });

      const result = await billing.exportData({});
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.company.name).toBe('Test Co');
      expect(body.estimates).toHaveLength(2);
      expect(body.estimates[0].id).toBe('est-1');
      expect(body.estimates[0].PK).toBeUndefined(); // keys stripped
      expect(body.totalEstimates).toBe(2);
      expect(body.exportDate).toBeDefined();
    });

    test('handles paginated query results', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.get.mockResolvedValue({
        name: 'Test Co',
        email: 'test@co.com',
        phone: '555-0000',
        address: '123 Main St'
      });
      db.query
        .mockResolvedValueOnce({
          items: [{ PK: 'COMPANY#comp-1', SK: 'EST#1', GSI1PK: 'x', GSI1SK: 'y', id: 'est-1' }],
          nextKey: 'cursor1'
        })
        .mockResolvedValueOnce({
          items: [{ PK: 'COMPANY#comp-1', SK: 'EST#2', GSI1PK: 'x', GSI1SK: 'y', id: 'est-2' }],
          nextKey: null
        });

      const result = await billing.exportData({});
      const body = JSON.parse(result.body);

      expect(body.totalEstimates).toBe(2);
      expect(db.query).toHaveBeenCalledTimes(2);
    });

    test('returns 403 when no auth', async () => {
      auth.getCompanyId.mockResolvedValue(null);
      const result = await billing.exportData({});
      expect(result.statusCode).toBe(403);
    });

    test('returns 404 when company not found', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.get.mockResolvedValue(undefined);

      const result = await billing.exportData({});
      expect(result.statusCode).toBe(404);
    });
  });

  // ===== SHARE BONUS =====
  describe('shareBonus', () => {
    function currentMonth() {
      const now = new Date();
      return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    }

    test('sets shareBonusMonth on company and returns granted true', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.get.mockResolvedValue({ subscriptionStatus: 'free', tier: 'free' });

      const result = await billing.shareBonus({ body: '{}' });
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.granted).toBe(true);
      expect(db.update).toHaveBeenCalledWith(
        'COMPANY#comp-1', 'PROFILE',
        { shareBonusMonth: currentMonth() }
      );
    });

    test('returns granted false when already claimed this month', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.get.mockResolvedValue({
        subscriptionStatus: 'free',
        tier: 'free',
        shareBonusMonth: currentMonth()
      });

      const result = await billing.shareBonus({ body: '{}' });
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.granted).toBe(false);
      expect(db.update).not.toHaveBeenCalled();
    });

    test('allows claiming when shareBonusMonth is from a different month', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.get.mockResolvedValue({
        subscriptionStatus: 'free',
        tier: 'free',
        shareBonusMonth: '2025-01'
      });

      const result = await billing.shareBonus({ body: '{}' });
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.granted).toBe(true);
      expect(db.update).toHaveBeenCalledWith(
        'COMPANY#comp-1', 'PROFILE',
        { shareBonusMonth: currentMonth() }
      );
    });

    test('returns 403 when no auth', async () => {
      auth.getCompanyId.mockResolvedValue(null);
      const result = await billing.shareBonus({ body: '{}' });
      expect(result.statusCode).toBe(403);
    });

    test('status returns estimateLimit 3 when share bonus is active', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.get.mockResolvedValue({
        subscriptionStatus: 'free',
        tier: 'free',
        shareBonusMonth: currentMonth()
      });
      db.query.mockResolvedValue({ items: [] });

      const result = await billing.status({});
      const body = JSON.parse(result.body);

      expect(body.estimateLimit).toBe(3);
    });
  });
});
