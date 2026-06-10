// Shared definition of a "billable" estimate: contractor-created and not
// deleted. Incoming website-widget leads are excluded everywhere — receiving
// leads must never count against a plan allowance or inflate usage.
//
// Counts by paginating newest-first past any volume of widget leads; a fixed
// Limit-50 window could be fully diluted by leads, silently disabling the
// free-tier cap.
function isBillable(item) {
  return item.status !== 'deleted' && item.source !== 'website-widget';
}

async function countBillableSince(db, companyId, monthStartIso, maxPages = 10) {
  let count = 0;
  let lastKey = null;
  let pages = 0;
  do {
    const res = await db.query('COMPANY#' + companyId, 'EST#', 50, lastKey);
    for (const item of res.items) {
      // newest-first and SK is time-ordered: once we pass monthStart, we're done
      if ((item.createdAt || '') < monthStartIso) return count;
      if (isBillable(item)) count++;
    }
    lastKey = res.nextKey;
  } while (lastKey && ++pages < maxPages);
  return count;
}

module.exports = { isBillable, countBillableSince };
