const crypto = require('crypto');

/**
 * Create an in-app notification for a company.
 * Stores as PK=COMPANY#<id>, SK=NOTIF#<iso>#<uuid> with 90-day TTL.
 */
async function notify(db, companyId, { type, title, message, link }) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const expiresAt = Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60); // 90 days TTL

  const item = {
    PK: 'COMPANY#' + companyId,
    SK: 'NOTIF#' + now + '#' + id,
    id,
    type: type || 'info',
    title,
    message: message || '',
    link: link || '',
    read: false,
    createdAt: now,
    expiresAt
  };

  await db.put(item);
  return item;
}

module.exports = { notify };
