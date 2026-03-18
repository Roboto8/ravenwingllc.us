const db = require('./lib/dynamo');
const getStripe = require('./lib/stripe');

module.exports.handler = async (event) => {
  const s = getStripe();
  const sig = event.headers['stripe-signature'];

  let stripeEvent;
  try {
    stripeEvent = s.webhooks.constructEvent(
      event.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return { statusCode: 400, body: 'Invalid signature' };
  }

  // Idempotency: skip events already processed
  const eventId = stripeEvent.id;
  if (eventId) {
    const existing = await db.get('WEBHOOK', eventId);
    if (existing) {
      console.log('Skipping already-processed webhook event:', eventId);
      return { statusCode: 200, body: 'already processed' };
    }
    // Record event with TTL (24 hours from now)
    await db.put({
      PK: 'WEBHOOK',
      SK: eventId,
      processedAt: new Date().toISOString(),
      ttl: Math.floor(Date.now() / 1000) + 86400
    });
  }

  const data = stripeEvent.data.object;

  try {
  switch (stripeEvent.type) {
    case 'checkout.session.completed': {
      const customerId = data.customer;
      const subscriptionId = data.subscription;
      const companyId = await findCompanyByStripeId(customerId);
      if (companyId && subscriptionId) {
        // Detect tier from the subscription's price
        let tier = 'pro';
        try {
          const sub = await s.subscriptions.retrieve(subscriptionId);
          const priceId = sub.items.data[0].price.id;
          if (priceId === process.env.STRIPE_PRICE_SOLO) tier = 'solo';
          else if (priceId === process.env.STRIPE_PRICE_TEAM) tier = 'team';
          else tier = 'pro';
        } catch (e) {}
        await db.update('COMPANY#' + companyId, 'PROFILE', {
          subscriptionStatus: 'active',
          subscriptionId,
          tier
        });
      }
      break;
    }

    case 'customer.subscription.updated': {
      const customerId = data.customer;
      const companyId = await findCompanyByStripeId(customerId);
      if (companyId) {
        const status = data.status === 'active' ? 'active'
          : data.status === 'past_due' ? 'past_due'
          : data.status === 'canceled' ? 'canceled'
          : data.status;
        await db.update('COMPANY#' + companyId, 'PROFILE', {
          subscriptionStatus: status,
          subscriptionId: data.id
        });
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const customerId = data.customer;
      const companyId = await findCompanyByStripeId(customerId);
      if (companyId) {
        await db.update('COMPANY#' + companyId, 'PROFILE', {
          subscriptionStatus: 'canceled',
          subscriptionId: ''
        });
      }
      break;
    }

    case 'invoice.payment_failed': {
      const customerId = data.customer;
      const companyId = await findCompanyByStripeId(customerId);
      if (companyId) {
        await db.update('COMPANY#' + companyId, 'PROFILE', {
          subscriptionStatus: 'past_due'
        });
      }
      break;
    }

    case 'invoice.paid': {
      // Successful payment — ensure status is active
      const customerId = data.customer;
      const companyId = await findCompanyByStripeId(customerId);
      if (companyId && data.subscription) {
        await db.update('COMPANY#' + companyId, 'PROFILE', {
          subscriptionStatus: 'active',
          subscriptionId: data.subscription,
          lastPaymentAt: new Date().toISOString()
        });
      }
      break;
    }

    case 'charge.refunded': {
      // Full refund — cancel access
      const customerId = data.customer;
      const companyId = await findCompanyByStripeId(customerId);
      if (companyId && data.refunded) {
        await db.update('COMPANY#' + companyId, 'PROFILE', {
          subscriptionStatus: 'canceled',
          subscriptionId: '',
          canceledAt: new Date().toISOString(),
          cancelReason: 'refunded'
        });
        // Cancel the subscription in Stripe too
        try {
          if (data.invoice) {
            const invoice = await s.invoices.retrieve(data.invoice);
            if (invoice.subscription) {
              await s.subscriptions.cancel(invoice.subscription);
            }
          }
        } catch (e) {
          console.error('Could not cancel subscription after refund:', e.message);
        }
      }
      break;
    }

    case 'customer.subscription.trial_will_end': {
      // Trial ending in 3 days — could send notification email
      console.log('Trial ending soon for customer:', data.customer);
      break;
    }

    case 'charge.dispute.created': {
      // Chargeback — immediately revoke access
      const customerId = data.customer;
      const companyId = await findCompanyByStripeId(customerId);
      if (companyId) {
        await db.update('COMPANY#' + companyId, 'PROFILE', {
          subscriptionStatus: 'canceled',
          subscriptionId: '',
          canceledAt: new Date().toISOString(),
          cancelReason: 'dispute'
        });
      }
      break;
    }
  }
  } catch (err) {
    console.error('Webhook DB error for event ' + stripeEvent.type + ':', err.message);
    return { statusCode: 500, body: 'Internal error' };
  }

  return { statusCode: 200, body: 'ok' };
};

async function findCompanyByStripeId(stripeCustomerId) {
  const items = await db.queryGSI('STRIPE#' + stripeCustomerId);
  if (items.length > 0) {
    return items[0].PK.replace('COMPANY#', '');
  }
  return null;
}
