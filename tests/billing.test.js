jest.mock('../handlers/lib/dynamo', () => ({
  get: jest.fn(),
  put: jest.fn(),
  update: jest.fn(),
  query: jest.fn(),
  queryGSI: jest.fn()
}));

jest.mock('../handlers/lib/auth', () => ({
  getUser: jest.fn(),
  getCompanyId: jest.fn()
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
    subscriptionStatus: 'trialing',
    trialEndsAt: new Date(Date.now() + 7 * 86400000).toISOString()
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
        { stripeCustomerId: 'cus_new' }
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
        body: JSON.stringify({ returnUrl: 'https://myapp.com/settings' })
      });
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.url).toBe('https://billing.stripe.com/portal123');
      expect(mockStripe.billingPortal.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: 'cus_existing',
          return_url: 'https://myapp.com/settings'
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

    test('returns trialing status with days left', async () => {
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.get.mockResolvedValue({
        subscriptionStatus: 'trialing',
        trialEndsAt: futureDate
      });

      const result = await billing.status({});
      const body = JSON.parse(result.body);

      expect(body.status).toBe('trialing');
      expect(body.trialActive).toBe(true);
      expect(body.active).toBe(true);
      expect(body.daysLeft).toBeGreaterThanOrEqual(6);
      expect(body.daysLeft).toBeLessThanOrEqual(8);
    });

    test('returns expired trial status', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.get.mockResolvedValue({
        subscriptionStatus: 'trialing',
        trialEndsAt: '2020-01-01T00:00:00.000Z'
      });

      const result = await billing.status({});
      const body = JSON.parse(result.body);

      expect(body.status).toBe('trialing');
      expect(body.trialActive).toBe(false);
      expect(body.active).toBe(false);
      expect(body.daysLeft).toBe(0);
    });

    test('returns canceled status', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.get.mockResolvedValue({
        subscriptionStatus: 'canceled',
        trialEndsAt: '2025-01-01T00:00:00.000Z'
      });

      const result = await billing.status({});
      const body = JSON.parse(result.body);

      expect(body.status).toBe('canceled');
      expect(body.active).toBe(false);
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
  });
});
