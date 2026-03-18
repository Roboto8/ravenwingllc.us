#!/usr/bin/env node
/**
 * One-time backfill: Add GSI1PK/GSI1SK to company profiles that have a stripeCustomerId
 * so the webhook handler can look them up via queryGSI instead of Scan.
 *
 * Usage:
 *   node scripts/backfill-stripe-gsi.js [stage]
 *   e.g. node scripts/backfill-stripe-gsi.js prod
 *
 * Defaults to 'dev' stage.
 */
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

const stage = process.argv[2] || 'dev';
const TABLE = 'fencecalc-' + stage;

const client = new DynamoDBClient({ region: 'us-east-1' });
const ddb = DynamoDBDocumentClient.from(client);

async function backfill() {
  console.log('Backfilling Stripe GSI records for table:', TABLE);

  let lastKey = undefined;
  let updated = 0;
  let skipped = 0;

  do {
    const result = await ddb.send(new ScanCommand({
      TableName: TABLE,
      FilterExpression: 'SK = :sk AND attribute_exists(stripeCustomerId)',
      ExpressionAttributeValues: { ':sk': 'PROFILE' },
      ExclusiveStartKey: lastKey
    }));

    for (const item of (result.Items || [])) {
      const stripeId = item.stripeCustomerId;
      if (!stripeId) { skipped++; continue; }

      // Skip if already has GSI1PK set to STRIPE#
      if (item.GSI1PK && item.GSI1PK.startsWith('STRIPE#')) {
        skipped++;
        continue;
      }

      console.log('  Updating', item.PK, '-> GSI1PK: STRIPE#' + stripeId);
      await ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: { PK: item.PK, SK: item.SK },
        UpdateExpression: 'SET GSI1PK = :gsi1pk, GSI1SK = :gsi1sk',
        ExpressionAttributeValues: {
          ':gsi1pk': 'STRIPE#' + stripeId,
          ':gsi1sk': 'PROFILE'
        }
      }));
      updated++;
    }

    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  console.log('Done. Updated:', updated, 'Skipped:', skipped);
}

backfill().catch(err => {
  console.error('Backfill failed:', err.message);
  process.exit(1);
});
