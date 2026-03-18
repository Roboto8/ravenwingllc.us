/**
 * Additional edge case tests for FenceTrace handlers
 * Covers gaps identified in the existing test suite
 */

// ============================================================================
// WEBHOOK: invoice.paid, charge.refunded, charge.dispute.created,
//          customer.subscription.trial_will_end
// ============================================================================
const mockScan = jest.fn();
const mockInvoicesRetrieve = jest.fn();
const mockSubscriptionsCancel = jest.fn();

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

const mockConstructEvent = jest.fn();
const mockSubscriptionsRetrieve = jest.fn().mockResolvedValue({
  items: { data: [{ price: { id: 'price_pro_test' } }] }
});
const mockStripeWebhook = {
  webhooks: { constructEvent: mockConstructEvent },
  subscriptions: { retrieve: mockSubscriptionsRetrieve, cancel: mockSubscriptionsCancel },
  invoices: { retrieve: mockInvoicesRetrieve }
};
jest.mock('stripe', () => jest.fn().mockReturnValue(mockStripeWebhook));

jest.mock('../handlers/lib/dynamo', () => ({
  update: jest.fn().mockResolvedValue({}),
  get: jest.fn().mockResolvedValue(null),
  put: jest.fn().mockResolvedValue({}),
  queryGSI: jest.fn().mockResolvedValue([{ PK: 'COMPANY#comp-abc', SK: 'PROFILE', stripeCustomerId: 'cus_123' }])
}));

describe('webhook handler - missing event types', () => {
  let handler;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = 'sk_test_xxx';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
    process.env.DYNAMODB_TABLE = 'test-table';

    mockScan.mockResolvedValue({
      Items: [{ PK: 'COMPANY#comp-abc', SK: 'PROFILE', stripeCustomerId: 'cus_123' }]
    });

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
    jest.mock('stripe', () => jest.fn().mockReturnValue(mockStripeWebhook));
    jest.mock('../handlers/lib/dynamo', () => ({
      update: jest.fn().mockResolvedValue({}),
      get: jest.fn().mockResolvedValue(null),
      put: jest.fn().mockResolvedValue({}),
      queryGSI: jest.fn().mockResolvedValue([{ PK: 'COMPANY#comp-abc', SK: 'PROFILE', stripeCustomerId: 'cus_123' }])
    }));

    handler = require('../handlers/webhook').handler;
  });

  function makeEvent() {
    return { body: 'raw_body', headers: { 'stripe-signature': 'valid_sig' } };
  }

  // ===== invoice.paid =====
  describe('invoice.paid', () => {
    test('sets subscription to active with lastPaymentAt', async () => {
      const db = require('../handlers/lib/dynamo');
      mockConstructEvent.mockReturnValue({
        id: 'evt_paid_1',
        type: 'invoice.paid',
        data: {
          object: {
            customer: 'cus_123',
            subscription: 'sub_paid'
          }
        }
      });

      const result = await handler(makeEvent());
      expect(result.statusCode).toBe(200);
      expect(db.update).toHaveBeenCalledWith(
        'COMPANY#comp-abc', 'PROFILE',
        expect.objectContaining({
          subscriptionStatus: 'active',
          subscriptionId: 'sub_paid',
          lastPaymentAt: expect.any(String)
        })
      );
    });

    test('no-op when company not found', async () => {
      const db = require('../handlers/lib/dynamo');
      db.queryGSI.mockResolvedValueOnce([]);
      mockConstructEvent.mockReturnValue({
        id: 'evt_paid_2',
        type: 'invoice.paid',
        data: { object: { customer: 'cus_unknown', subscription: 'sub_x' } }
      });

      await handler(makeEvent());
      expect(db.update).not.toHaveBeenCalled();
    });

    test('no-op when subscription is null', async () => {
      const db = require('../handlers/lib/dynamo');
      mockConstructEvent.mockReturnValue({
        id: 'evt_paid_3',
        type: 'invoice.paid',
        data: { object: { customer: 'cus_123', subscription: null } }
      });

      await handler(makeEvent());
      expect(db.update).not.toHaveBeenCalled();
    });
  });

  // ===== charge.refunded =====
  describe('charge.refunded', () => {
    test('cancels access on full refund', async () => {
      const db = require('../handlers/lib/dynamo');
      mockInvoicesRetrieve.mockResolvedValue({ subscription: 'sub_to_cancel' });
      mockSubscriptionsCancel.mockResolvedValue({});
      mockConstructEvent.mockReturnValue({
        id: 'evt_refund_1',
        type: 'charge.refunded',
        data: {
          object: {
            customer: 'cus_123',
            refunded: true,
            invoice: 'inv_123'
          }
        }
      });

      const result = await handler(makeEvent());
      expect(result.statusCode).toBe(200);
      expect(db.update).toHaveBeenCalledWith(
        'COMPANY#comp-abc', 'PROFILE',
        expect.objectContaining({
          subscriptionStatus: 'canceled',
          subscriptionId: '',
          cancelReason: 'refunded'
        })
      );
    });

    test('no-op when refunded is false (partial refund)', async () => {
      const db = require('../handlers/lib/dynamo');
      mockConstructEvent.mockReturnValue({
        id: 'evt_refund_2',
        type: 'charge.refunded',
        data: {
          object: {
            customer: 'cus_123',
            refunded: false,
            invoice: 'inv_123'
          }
        }
      });

      await handler(makeEvent());
      expect(db.update).not.toHaveBeenCalled();
    });

    test('handles Stripe cancel failure gracefully', async () => {
      const db = require('../handlers/lib/dynamo');
      mockInvoicesRetrieve.mockResolvedValue({ subscription: 'sub_err' });
      mockSubscriptionsCancel.mockRejectedValue(new Error('Stripe error'));
      mockConstructEvent.mockReturnValue({
        id: 'evt_refund_3',
        type: 'charge.refunded',
        data: {
          object: {
            customer: 'cus_123',
            refunded: true,
            invoice: 'inv_err'
          }
        }
      });

      const result = await handler(makeEvent());
      // Should still return 200, just log the error
      expect(result.statusCode).toBe(200);
      expect(db.update).toHaveBeenCalled();
    });

    test('handles missing invoice field', async () => {
      const db = require('../handlers/lib/dynamo');
      mockConstructEvent.mockReturnValue({
        id: 'evt_refund_4',
        type: 'charge.refunded',
        data: {
          object: {
            customer: 'cus_123',
            refunded: true,
            invoice: null
          }
        }
      });

      const result = await handler(makeEvent());
      expect(result.statusCode).toBe(200);
      expect(db.update).toHaveBeenCalled();
      // Should not try to cancel subscription since no invoice
      expect(mockInvoicesRetrieve).not.toHaveBeenCalled();
    });

    test('no-op when company not found', async () => {
      const db = require('../handlers/lib/dynamo');
      db.queryGSI.mockResolvedValueOnce([]);
      mockConstructEvent.mockReturnValue({
        id: 'evt_refund_5',
        type: 'charge.refunded',
        data: { object: { customer: 'cus_unknown', refunded: true } }
      });

      await handler(makeEvent());
      expect(db.update).not.toHaveBeenCalled();
    });
  });

  // ===== charge.dispute.created =====
  describe('charge.dispute.created', () => {
    test('immediately revokes access', async () => {
      const db = require('../handlers/lib/dynamo');
      mockConstructEvent.mockReturnValue({
        id: 'evt_dispute_1',
        type: 'charge.dispute.created',
        data: {
          object: { customer: 'cus_123' }
        }
      });

      const result = await handler(makeEvent());
      expect(result.statusCode).toBe(200);
      expect(db.update).toHaveBeenCalledWith(
        'COMPANY#comp-abc', 'PROFILE',
        expect.objectContaining({
          subscriptionStatus: 'canceled',
          subscriptionId: '',
          cancelReason: 'dispute'
        })
      );
    });

    test('no-op when company not found', async () => {
      const db = require('../handlers/lib/dynamo');
      db.queryGSI.mockResolvedValueOnce([]);
      mockConstructEvent.mockReturnValue({
        id: 'evt_dispute_2',
        type: 'charge.dispute.created',
        data: { object: { customer: 'cus_unknown' } }
      });

      await handler(makeEvent());
      expect(db.update).not.toHaveBeenCalled();
    });
  });

  // ===== customer.subscription.trial_will_end =====
  describe('customer.subscription.trial_will_end', () => {
    test('logs trial ending and returns 200', async () => {
      const db = require('../handlers/lib/dynamo');
      mockConstructEvent.mockReturnValue({
        id: 'evt_trial_end_1',
        type: 'customer.subscription.trial_will_end',
        data: { object: { customer: 'cus_123' } }
      });

      const result = await handler(makeEvent());
      expect(result.statusCode).toBe(200);
      // This event only logs, doesn't update DB
      expect(db.update).not.toHaveBeenCalled();
    });
  });
});
