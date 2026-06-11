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

  // Idempotency: atomically claim the event id. The claim must be released if
  // processing fails — otherwise Stripe's retry would be skipped and a failed
  // event (e.g. checkout.session.completed) would be dropped forever.
  const eventId = stripeEvent.id;
  if (eventId) {
    const claimed = await db.putIfNotExists({
      PK: 'WEBHOOK',
      SK: eventId,
      processedAt: new Date().toISOString(),
      expiresAt: Math.floor(Date.now() / 1000) + 86400 // table TTL attribute
    });
    if (!claimed) {
      console.log('Skipping already-processed webhook event:', eventId);
      return { statusCode: 200, body: 'already processed' };
    }
  }

  const data = stripeEvent.data.object;

  try {
  switch (stripeEvent.type) {
    case 'checkout.session.completed': {
      const customerId = data.customer;
      const subscriptionId = data.subscription;
      const companyId = await findCompanyByStripeId(customerId);
      if (companyId && subscriptionId) {
        // Detect tier from the subscription's price. New checkouts are 'pro';
        // builder/contractor are legacy plans still honored for old subscribers.
        let tier = 'pro';
        try {
          const sub = await s.subscriptions.retrieve(subscriptionId);
          const priceId = sub.items.data[0].price.id;
          if (priceId === process.env.STRIPE_PRICE_BUILDER) tier = 'builder';
          else if (priceId === process.env.STRIPE_PRICE_CONTRACTOR) tier = 'contractor';
          else if (priceId !== process.env.STRIPE_PRICE_PRO) {
            console.warn('Unrecognized checkout price, defaulting tier to pro:', priceId);
          }
        } catch (e) { console.warn('Could not retrieve subscription tier:', e.message); }
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
        const updateFields = { subscriptionStatus: status, subscriptionId: data.id };
        if (status === 'canceled') updateFields.tier = 'free';
        await db.update('COMPANY#' + companyId, 'PROFILE', updateFields);
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const customerId = data.customer;
      const companyId = await findCompanyByStripeId(customerId);
      if (companyId) {
        await db.update('COMPANY#' + companyId, 'PROFILE', {
          subscriptionStatus: 'canceled',
          subscriptionId: '',
          tier: 'free'
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
          tier: 'free',
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
          tier: 'free',
          canceledAt: new Date().toISOString(),
          cancelReason: 'dispute'
        });
      }
      break;
    }
  }
  } catch (err) {
    console.error('Webhook DB error for event ' + stripeEvent.type + ':', err.message);
    // Release the idempotency claim so Stripe's retry can reprocess the event
    if (eventId) {
      try { await db.remove('WEBHOOK', eventId); } catch (e) {
        console.error('Failed to release webhook claim ' + eventId + ':', e.message);
      }
    }
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
