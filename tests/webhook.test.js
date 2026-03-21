// Mock AWS SDK for the scan in findCompanyByStripeId
const mockScan = jest.fn();
jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({}))
}));
jest.mock('@aws-sdk/lib-dynamodb', () => {
  return {
    DynamoDBDocumentClient: {
      from: jest.fn().mockReturnValue({ send: mockScan })
    },
    GetCommand: jest.fn(),
    PutCommand: jest.fn(),
    UpdateCommand: jest.fn().mockImplementation((params) => ({ input: params })),
    DeleteCommand: jest.fn(),
    QueryCommand: jest.fn(),
    ScanCommand: jest.fn().mockImplementation((params) => ({ input: params }))
  };
});

// Mock stripe
const mockConstructEvent = jest.fn();
const mockSubscriptionsRetrieve = jest.fn().mockResolvedValue({
  items: { data: [{ price: { id: 'price_contractor_test' } }] }
});
const mockStripe = {
  webhooks: {
    constructEvent: mockConstructEvent
  },
  subscriptions: {
    retrieve: mockSubscriptionsRetrieve
  }
};
jest.mock('stripe', () => jest.fn().mockReturnValue(mockStripe));

// Mock dynamo lib (used in db.update, db.get, db.put for idempotency)
jest.mock('../handlers/lib/dynamo', () => ({
  update: jest.fn().mockResolvedValue({}),
  get: jest.fn().mockResolvedValue(null),
  put: jest.fn().mockResolvedValue({}),
  queryGSI: jest.fn().mockResolvedValue([{ PK: 'COMPANY#comp-abc', SK: 'PROFILE', stripeCustomerId: 'cus_123' }])
}));

const db = require('../handlers/lib/dynamo');

describe('webhook handler', () => {
  let handler;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = 'sk_test_xxx';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
    process.env.DYNAMODB_TABLE = 'test-table';

    // Default: findCompanyByStripeId returns a company
    mockScan.mockResolvedValue({
      Items: [{ PK: 'COMPANY#comp-abc', SK: 'PROFILE', stripeCustomerId: 'cus_123' }]
    });

    // Re-require to avoid stale stripe singleton
    jest.resetModules();
    jest.mock('@aws-sdk/client-dynamodb', () => ({
      DynamoDBClient: jest.fn().mockImplementation(() => ({}))
    }));
    jest.mock('@aws-sdk/lib-dynamodb', () => ({
      DynamoDBDocumentClient: {
        from: jest.fn().mockReturnValue({ send: mockScan })
      },
      GetCommand: jest.fn(),
      PutCommand: jest.fn(),
      UpdateCommand: jest.fn(),
      DeleteCommand: jest.fn(),
      QueryCommand: jest.fn(),
      ScanCommand: jest.fn().mockImplementation((params) => ({ input: params }))
    }));
    jest.mock('stripe', () => jest.fn().mockReturnValue(mockStripe));
    jest.mock('../handlers/lib/dynamo', () => ({
      update: jest.fn().mockResolvedValue({}),
      get: jest.fn().mockResolvedValue(null),
      put: jest.fn().mockResolvedValue({}),
      queryGSI: jest.fn().mockResolvedValue([{ PK: 'COMPANY#comp-abc', SK: 'PROFILE', stripeCustomerId: 'cus_123' }])
    }));

    handler = require('../handlers/webhook').handler;
  });

  function makeEvent(sig = 'valid_sig') {
    return {
      body: 'raw_body',
      headers: { 'stripe-signature': sig }
    };
  }

  // ===== Signature verification =====
  describe('signature verification', () => {
    test('returns 400 on invalid signature', async () => {
      mockConstructEvent.mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      const result = await handler(makeEvent());
      expect(result.statusCode).toBe(400);
      expect(result.body).toContain('Invalid signature');
    });
  });

  // ===== checkout.session.completed =====
  describe('checkout.session.completed', () => {
    test('sets subscription to active', async () => {
      const db = require('../handlers/lib/dynamo');
      mockConstructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        data: {
          object: {
            customer: 'cus_123',
            subscription: 'sub_abc'
          }
        }
      });

      const result = await handler(makeEvent());

      expect(result.statusCode).toBe(200);
      expect(db.update).toHaveBeenCalledWith(
        'COMPANY#comp-abc', 'PROFILE',
        expect.objectContaining({ subscriptionStatus: 'active', subscriptionId: 'sub_abc' })
      );
    });

    test('no-op when company not found', async () => {
      const db = require('../handlers/lib/dynamo');
      db.queryGSI.mockResolvedValueOnce([]);
      mockConstructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        data: { object: { customer: 'cus_unknown', subscription: 'sub_abc' } }
      });

      const result = await handler(makeEvent());
      expect(result.statusCode).toBe(200);
      expect(db.update).not.toHaveBeenCalled();
    });
  });

  // ===== customer.subscription.updated =====
  describe('customer.subscription.updated', () => {
    test.each([
      ['active', 'active'],
      ['past_due', 'past_due'],
      ['unpaid', 'unpaid'] // passthrough for unknown status
    ])('maps stripe status "%s" to "%s"', async (stripeStatus, expectedStatus) => {
      const db = require('../handlers/lib/dynamo');
      mockConstructEvent.mockReturnValue({
        type: 'customer.subscription.updated',
        data: {
          object: {
            customer: 'cus_123',
            id: 'sub_xyz',
            status: stripeStatus
          }
        }
      });

      await handler(makeEvent());

      expect(db.update).toHaveBeenCalledWith(
        'COMPANY#comp-abc', 'PROFILE',
        { subscriptionStatus: expectedStatus, subscriptionId: 'sub_xyz' }
      );
    });

    test('maps stripe status "canceled" and sets tier to free', async () => {
      const db = require('../handlers/lib/dynamo');
      mockConstructEvent.mockReturnValue({
        type: 'customer.subscription.updated',
        data: {
          object: {
            customer: 'cus_123',
            id: 'sub_xyz',
            status: 'canceled'
          }
        }
      });

      await handler(makeEvent());

      expect(db.update).toHaveBeenCalledWith(
        'COMPANY#comp-abc', 'PROFILE',
        { subscriptionStatus: 'canceled', subscriptionId: 'sub_xyz', tier: 'free' }
      );
    });
  });

  // ===== customer.subscription.deleted =====
  describe('customer.subscription.deleted', () => {
    test('sets subscription to canceled and clears subscriptionId', async () => {
      const db = require('../handlers/lib/dynamo');
      mockConstructEvent.mockReturnValue({
        type: 'customer.subscription.deleted',
        data: {
          object: {
            customer: 'cus_123',
            id: 'sub_xyz'
          }
        }
      });

      await handler(makeEvent());

      expect(db.update).toHaveBeenCalledWith(
        'COMPANY#comp-abc', 'PROFILE',
        { subscriptionStatus: 'canceled', subscriptionId: '', tier: 'free' }
      );
    });
  });

  // ===== invoice.payment_failed =====
  describe('invoice.payment_failed', () => {
    test('sets subscription to past_due', async () => {
      const db = require('../handlers/lib/dynamo');
      mockConstructEvent.mockReturnValue({
        type: 'invoice.payment_failed',
        data: {
          object: {
            customer: 'cus_123'
          }
        }
      });

      await handler(makeEvent());

      expect(db.update).toHaveBeenCalledWith(
        'COMPANY#comp-abc', 'PROFILE',
        { subscriptionStatus: 'past_due' }
      );
    });
  });

  // ===== checkout.session.completed - tier detection =====
  describe('checkout.session.completed - tier detection', () => {
    test('detects builder tier from price ID', async () => {
      process.env.STRIPE_PRICE_BUILDER = 'price_builder_test';
      const db = require('../handlers/lib/dynamo');

      mockSubscriptionsRetrieve.mockResolvedValue({
        items: { data: [{ price: { id: 'price_builder_test' } }] }
      });

      mockConstructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        data: {
          object: { customer: 'cus_123', subscription: 'sub_builder' }
        }
      });

      await handler(makeEvent());

      expect(db.update).toHaveBeenCalledWith(
        'COMPANY#comp-abc', 'PROFILE',
        expect.objectContaining({ tier: 'builder' })
      );
    });

    test('defaults to contractor tier when price does not match', async () => {
      process.env.STRIPE_PRICE_BUILDER = 'price_builder_test';
      const db = require('../handlers/lib/dynamo');

      mockSubscriptionsRetrieve.mockResolvedValue({
        items: { data: [{ price: { id: 'price_unknown' } }] }
      });

      mockConstructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        data: {
          object: { customer: 'cus_123', subscription: 'sub_contractor' }
        }
      });

      await handler(makeEvent());

      expect(db.update).toHaveBeenCalledWith(
        'COMPANY#comp-abc', 'PROFILE',
        expect.objectContaining({ tier: 'contractor' })
      );
    });

    test('defaults to contractor tier when subscription retrieve fails', async () => {
      const db = require('../handlers/lib/dynamo');

      mockSubscriptionsRetrieve.mockRejectedValue(new Error('Stripe error'));

      mockConstructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        data: {
          object: { customer: 'cus_123', subscription: 'sub_err' }
        }
      });

      await handler(makeEvent());

      expect(db.update).toHaveBeenCalledWith(
        'COMPANY#comp-abc', 'PROFILE',
        expect.objectContaining({ tier: 'contractor' })
      );
    });

    test('no-op when subscription is missing', async () => {
      const db = require('../handlers/lib/dynamo');
      mockConstructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        data: {
          object: { customer: 'cus_123', subscription: null }
        }
      });

      await handler(makeEvent());
      expect(db.update).not.toHaveBeenCalled();
    });
  });

  // ===== company not found paths =====
  describe('customer.subscription.updated - company not found', () => {
    test('no-op when company not found', async () => {
      const db = require('../handlers/lib/dynamo');
      db.queryGSI.mockResolvedValueOnce([]);
      mockConstructEvent.mockReturnValue({
        type: 'customer.subscription.updated',
        data: {
          object: { customer: 'cus_unknown', id: 'sub_xyz', status: 'active' }
        }
      });

      const result = await handler(makeEvent());
      expect(result.statusCode).toBe(200);
      expect(db.update).not.toHaveBeenCalled();
    });
  });

  describe('customer.subscription.deleted - company not found', () => {
    test('no-op when company not found', async () => {
      const db = require('../handlers/lib/dynamo');
      db.queryGSI.mockResolvedValueOnce([]);
      mockConstructEvent.mockReturnValue({
        type: 'customer.subscription.deleted',
        data: {
          object: { customer: 'cus_unknown', id: 'sub_xyz' }
        }
      });

      const result = await handler(makeEvent());
      expect(result.statusCode).toBe(200);
      expect(db.update).not.toHaveBeenCalled();
    });
  });

  describe('invoice.payment_failed - company not found', () => {
    test('no-op when company not found', async () => {
      const db = require('../handlers/lib/dynamo');
      db.queryGSI.mockResolvedValueOnce([]);
      mockConstructEvent.mockReturnValue({
        type: 'invoice.payment_failed',
        data: {
          object: { customer: 'cus_unknown' }
        }
      });

      const result = await handler(makeEvent());
      expect(result.statusCode).toBe(200);
      expect(db.update).not.toHaveBeenCalled();
    });
  });

  // ===== Unknown event type =====
  describe('unknown event type', () => {
    test('returns 200 without updating', async () => {
      const db = require('../handlers/lib/dynamo');
      mockConstructEvent.mockReturnValue({
        type: 'some.unknown.event',
        data: { object: { customer: 'cus_123' } }
      });

      const result = await handler(makeEvent());
      expect(result.statusCode).toBe(200);
      expect(db.update).not.toHaveBeenCalled();
    });
  });

  // ===== Webhook idempotency =====
  describe('idempotency', () => {
    test('skips already-processed event', async () => {
      const db = require('../handlers/lib/dynamo');
      db.get.mockResolvedValue({ PK: 'WEBHOOK', SK: 'evt_already', processedAt: '2025-01-01' });

      mockConstructEvent.mockReturnValue({
        id: 'evt_already',
        type: 'checkout.session.completed',
        data: { object: { customer: 'cus_123', subscription: 'sub_abc' } }
      });

      const result = await handler(makeEvent());
      expect(result.statusCode).toBe(200);
      expect(result.body).toContain('already processed');
      expect(db.update).not.toHaveBeenCalled();
      expect(db.put).not.toHaveBeenCalled();
    });

    test('records new event ID and processes it', async () => {
      const db = require('../handlers/lib/dynamo');
      db.get.mockResolvedValue(null);

      mockConstructEvent.mockReturnValue({
        id: 'evt_new_123',
        type: 'checkout.session.completed',
        data: { object: { customer: 'cus_123', subscription: 'sub_abc' } }
      });

      const result = await handler(makeEvent());
      expect(result.statusCode).toBe(200);
      expect(db.put).toHaveBeenCalledWith(
        expect.objectContaining({
          PK: 'WEBHOOK',
          SK: 'evt_new_123',
          processedAt: expect.any(String),
          ttl: expect.any(Number)
        })
      );
      expect(db.update).toHaveBeenCalled();
    });

    test('processes events without id (no idempotency check)', async () => {
      const db = require('../handlers/lib/dynamo');

      mockConstructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        data: { object: { customer: 'cus_123', subscription: 'sub_abc' } }
      });

      const result = await handler(makeEvent());
      expect(result.statusCode).toBe(200);
      expect(db.get).not.toHaveBeenCalled();
      expect(db.update).toHaveBeenCalled();
    });
  });
});
