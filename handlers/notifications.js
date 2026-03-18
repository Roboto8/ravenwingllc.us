const db = require('./lib/dynamo');
const auth = require('./lib/auth');
const res = require('./lib/response');

module.exports.list = res.wrap(async (event) => {
  const companyId = await auth.getCompanyId(event, db);
  if (!companyId) return res.forbidden();

  const { items } = await db.query('COMPANY#' + companyId, 'NOTIF#', 50);

  const notifications = items.map(stripKeys);
  const unreadCount = notifications.filter(n => !n.read).length;

  return res.ok({
    notifications,
    unreadCount
  });
});

module.exports.markRead = res.wrap(async (event) => {
  const companyId = await auth.getCompanyId(event, db);
  if (!companyId) return res.forbidden();

  const body = res.parseBody(event);
  if (!body) return res.bad('Invalid JSON');

  if (body.all) {
    // Mark all as read
    const { items } = await db.query('COMPANY#' + companyId, 'NOTIF#', 50);
    const unread = items.filter(n => !n.read);
    for (const n of unread) {
      await db.update(n.PK, n.SK, { read: true });
    }
    return res.ok({ marked: unread.length });
  }

  if (body.ids && Array.isArray(body.ids)) {
    // Mark specific notifications as read
    const { items } = await db.query('COMPANY#' + companyId, 'NOTIF#', 50);
    let marked = 0;
    for (const n of items) {
      if (body.ids.includes(n.id) && !n.read) {
        await db.update(n.PK, n.SK, { read: true });
        marked++;
      }
    }
    return res.ok({ marked });
  }

  return res.bad('Provide {ids: [...]} or {all: true}');
});

function stripKeys(item) {
  const { PK, SK, GSI1PK, GSI1SK, ...rest } = item;
  return rest;
}
