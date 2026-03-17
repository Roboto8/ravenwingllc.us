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
const mockStripe = {
  webhooks: {
    constructEvent: mockConstructEvent
  }
};
jest.mock('stripe', () => jest.fn().mockReturnValue(mockStripe));

// Mock dynamo lib (used in db.update)
jest.mock('../handlers/lib/dynamo', () => ({
  update: jest.fn().mockResolvedValue({})
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
      update: jest.fn().mockResolvedValue({})
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
        { subscriptionStatus: 'active', subscriptionId: 'sub_abc' }
      );
    });

    test('no-op when company not found', async () => {
      const db = require('../handlers/lib/dynamo');
      mockScan.mockResolvedValue({ Items: [] });
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
      ['canceled', 'canceled'],
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
        { subscriptionStatus: 'canceled', subscriptionId: '' }
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
});
