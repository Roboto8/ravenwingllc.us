const db = require('./lib/dynamo');

let stripe;
function getStripe() {
  if (!stripe) stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  return stripe;
}

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

  const data = stripeEvent.data.object;

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
  }

  return { statusCode: 200, body: 'ok' };
};

async function findCompanyByStripeId(stripeCustomerId) {
  // Scan is not ideal but with few companies it's fine for MVP
  const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
  const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb');
  const client = new DynamoDBClient({});
  const ddb = DynamoDBDocumentClient.from(client);

  const { Items } = await ddb.send(new ScanCommand({
    TableName: process.env.DYNAMODB_TABLE,
    FilterExpression: 'SK = :sk AND stripeCustomerId = :sid',
    ExpressionAttributeValues: {
      ':sk': 'PROFILE',
      ':sid': stripeCustomerId
    }
  }));

  if (Items && Items.length > 0) {
    return Items[0].PK.replace('COMPANY#', '');
  }
  return null;
}
