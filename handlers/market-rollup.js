// Nightly market rollup — the data-moat builder.
//
// Aggregates every estimate into anonymized regional pricing benchmarks:
// MARKET#<regionKey> / AGG#<yyyy-mm>#<fenceType> items with quote counts,
// price-per-foot stats, footage, acceptance and win rates, and median days
// sent→won. No customer data ever leaves the estimate items — aggregates
// carry numbers only, and regions with fewer than MIN_SAMPLE quotes are
// still stored (the corpus must accumulate) but flagged thin so any future
// benchmark UI knows not to display them.
//
// This corpus is the defensible asset: a competitor can clone the
// calculator in a weekend, but not a year of regional quote/outcome data.
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.DYNAMODB_TABLE;

const MIN_SAMPLE = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

function median(sorted) {
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

// Pure aggregation over scanned estimate items — unit-testable without AWS.
// Returns the list of MARKET# items to write.
function rollup(estimates, now = new Date()) {
  const buckets = new Map(); // regionKey|month|fenceType -> accumulator

  for (const est of estimates) {
    if (!est || est.status === 'deleted') continue;
    if (!est.regionKey || !est.createdAt) continue;
    const month = est.createdAt.slice(0, 7); // yyyy-mm
    const fenceType = est.fenceType || 'unknown';
    const key = est.regionKey + '|' + month + '|' + fenceType;

    let b = buckets.get(key);
    if (!b) {
      b = {
        regionKey: est.regionKey, month, fenceType,
        quotes: 0, totalFeet: 0,
        ppf: [], finalPpf: [],
        sent: 0, approved: 0, declined: 0, won: 0, lost: 0,
        daysToWin: [],
      };
      buckets.set(key, b);
    }

    b.quotes += 1;
    if (est.totalFeet > 0) b.totalFeet += est.totalFeet;
    if (typeof est.pricePerFoot === 'number') b.ppf.push(est.pricePerFoot);
    if (est.sentAt || est.status === 'sent' || est.status === 'approved' ||
        est.status === 'declined' || est.status === 'won' || est.status === 'lost') {
      b.sent += 1;
    }
    if (est.status === 'approved' || est.approvalStatus === 'approved') b.approved += 1;
    if (est.status === 'declined') b.declined += 1;
    if (est.status === 'won') {
      b.won += 1;
      if (typeof est.finalPrice === 'number' && est.totalFeet > 0) {
        b.finalPpf.push(round2(est.finalPrice / est.totalFeet));
      }
      if (est.sentAt && est.wonAt) {
        const days = (new Date(est.wonAt) - new Date(est.sentAt)) / DAY_MS;
        if (days >= 0 && days < 365) b.daysToWin.push(round2(days));
      }
    }
    if (est.status === 'lost') b.lost += 1;
  }

  const computedAt = now.toISOString();
  return [...buckets.values()].map((b) => {
    const ppfSorted = b.ppf.slice().sort((x, y) => x - y);
    const decided = b.won + b.lost;
    return {
      PK: 'MARKET#' + b.regionKey,
      SK: 'AGG#' + b.month + '#' + b.fenceType,
      regionKey: b.regionKey,
      month: b.month,
      fenceType: b.fenceType,
      quotes: b.quotes,
      totalFeet: round2(b.totalFeet),
      ppfMedian: median(ppfSorted),
      ppfMin: ppfSorted[0] ?? null,
      ppfMax: ppfSorted[ppfSorted.length - 1] ?? null,
      finalPpfMedian: median(b.finalPpf.slice().sort((x, y) => x - y)),
      sent: b.sent,
      approved: b.approved,
      declined: b.declined,
      won: b.won,
      lost: b.lost,
      // Of quotes that reached the customer, how many were approved or won?
      acceptanceRate: b.sent > 0 ? round2((b.approved + b.won) / b.sent) : null,
      // Of decided outcomes, how many closed?
      winRate: decided > 0 ? round2(b.won / decided) : null,
      medianDaysToWin: median(b.daysToWin.slice().sort((x, y) => x - y)),
      thinSample: b.quotes < MIN_SAMPLE,
      computedAt,
    };
  });
}

async function scanEstimates() {
  const estimates = [];
  let lastKey;
  do {
    const out = await ddb.send(new ScanCommand({
      TableName: TABLE,
      FilterExpression: 'begins_with(SK, :est)',
      ExpressionAttributeValues: { ':est': 'EST#' },
      ExclusiveStartKey: lastKey,
    }));
    estimates.push(...(out.Items || []));
    lastKey = out.LastEvaluatedKey;
  } while (lastKey);
  return estimates;
}

module.exports.handler = async () => {
  const estimates = await scanEstimates();
  const items = rollup(estimates);

  for (let i = 0; i < items.length; i += 25) {
    await ddb.send(new BatchWriteCommand({
      RequestItems: {
        [TABLE]: items.slice(i, i + 25).map((Item) => ({ PutRequest: { Item } })),
      },
    }));
  }

  console.log(JSON.stringify({
    msg: 'market-rollup complete',
    estimatesScanned: estimates.length,
    aggregatesWritten: items.length,
  }));
  return { estimatesScanned: estimates.length, aggregatesWritten: items.length };
};

module.exports.rollup = rollup;
