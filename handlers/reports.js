const db = require('./lib/dynamo');
const auth = require('./lib/auth');
const res = require('./lib/response');

module.exports.dashboard = res.wrap(async (event) => {
  const companyId = await auth.getCompanyId(event, db);
  if (!companyId) return res.forbidden();

  const period = event.queryStringParameters?.period || 'all';

  // Fetch all estimates (paginate if needed)
  let allEstimates = [];
  let cursor = null;
  do {
    const { items, nextKey } = await db.query('COMPANY#' + companyId, 'EST#', 200, cursor);
    allEstimates = allEstimates.concat(items);
    cursor = nextKey;
  } while (cursor);

  // Filter out deleted
  allEstimates = allEstimates.filter(e => e.status !== 'deleted');

  // Apply period filter
  const cutoff = getCutoff(period);
  if (cutoff) {
    allEstimates = allEstimates.filter(e => new Date(e.createdAt) >= cutoff);
  }

  // Compute metrics
  const totalEstimates = allEstimates.length;

  const approved = allEstimates.filter(e => e.status === 'approved');
  const sent = allEstimates.filter(e => e.status === 'sent' || e.status === 'approved' || e.status === 'declined');
  const totalRevenue = approved.reduce((sum, e) => sum + (parseFloat(e.totalCost) || 0), 0);
  const conversionRate = sent.length > 0 ? (approved.length / sent.length) : 0;

  const allCosts = allEstimates.map(e => parseFloat(e.totalCost) || 0);
  const averageEstimateValue = totalEstimates > 0 ? allCosts.reduce((a, b) => a + b, 0) / totalEstimates : 0;

  // Estimates by status
  const estimatesByStatus = {};
  allEstimates.forEach(e => {
    const s = e.status || 'draft';
    estimatesByStatus[s] = (estimatesByStatus[s] || 0) + 1;
  });

  // Estimates by month
  const byMonth = {};
  allEstimates.forEach(e => {
    const d = new Date(e.createdAt);
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    if (!byMonth[key]) byMonth[key] = { month: key, count: 0, revenue: 0 };
    byMonth[key].count++;
    if (e.status === 'approved') {
      byMonth[key].revenue += parseFloat(e.totalCost) || 0;
    }
  });
  const estimatesByMonth = Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month));

  // Top materials (by fenceType)
  const matCounts = {};
  allEstimates.forEach(e => {
    const t = e.fenceType || 'unknown';
    matCounts[t] = (matCounts[t] || 0) + 1;
  });
  const topMaterials = Object.entries(matCounts)
    .map(([material, count]) => ({ material, count }))
    .sort((a, b) => b.count - a.count);

  return res.ok({
    totalEstimates,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    conversionRate: Math.round(conversionRate * 1000) / 10, // percentage with 1 decimal
    averageEstimateValue: Math.round(averageEstimateValue * 100) / 100,
    estimatesByStatus,
    estimatesByMonth,
    topMaterials
  });
});

function getCutoff(period) {
  const now = new Date();
  switch (period) {
    case '30d': return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case '90d': return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    case '12m': return new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    default: return null; // 'all'
  }
}
