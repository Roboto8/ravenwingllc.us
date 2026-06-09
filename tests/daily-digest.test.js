const { aggregate, topAction } = require('../handlers/daily-digest');

describe('daily-digest aggregate', () => {
  const now = new Date('2026-06-08T12:00:00Z');
  const iso = (msAgo) => new Date(now.getTime() - msAgo).toISOString();
  const DAY = 24 * 60 * 60 * 1000;

  test('counts companies by subscription status', () => {
    const items = [
      { SK: 'PROFILE', subscriptionStatus: 'active', createdAt: iso(5 * DAY) },
      { SK: 'PROFILE', subscriptionStatus: 'active', createdAt: iso(40 * DAY) },
      { SK: 'PROFILE', subscriptionStatus: 'trialing', createdAt: iso(1 * DAY), trialEndsAt: iso(-2 * DAY) },
      { SK: 'PROFILE', subscriptionStatus: 'past_due', createdAt: iso(60 * DAY) },
      { SK: 'PROFILE', subscriptionStatus: 'canceled', createdAt: iso(90 * DAY) },
      { SK: 'PROFILE', createdAt: iso(90 * DAY) } // no status => free
    ];
    const m = aggregate(items, now);
    expect(m.totalCompanies).toBe(6);
    expect(m.active).toBe(2);
    expect(m.trialing).toBe(1);
    expect(m.pastDue).toBe(1);
    expect(m.freeOrCanceled).toBe(2);
  });

  test('counts new signups in 24h and 7d windows', () => {
    const items = [
      { SK: 'PROFILE', createdAt: iso(2 * 60 * 60 * 1000) }, // 2h ago
      { SK: 'PROFILE', createdAt: iso(3 * DAY) },            // 3d ago
      { SK: 'PROFILE', createdAt: iso(10 * DAY) }            // 10d ago
    ];
    const m = aggregate(items, now);
    expect(m.newSignups24h).toBe(1);
    expect(m.newSignups7d).toBe(2);
  });

  test('flags trials expiring within 3 days only', () => {
    const items = [
      { SK: 'PROFILE', subscriptionStatus: 'trialing', trialEndsAt: iso(-1 * DAY) },  // ends tomorrow
      { SK: 'PROFILE', subscriptionStatus: 'trialing', trialEndsAt: iso(-10 * DAY) }, // ends in 10d
      { SK: 'PROFILE', subscriptionStatus: 'trialing', trialEndsAt: iso(1 * DAY) }    // already expired
    ];
    const m = aggregate(items, now);
    expect(m.trialing).toBe(3);
    expect(m.trialExpiring3d).toBe(1);
  });

  test('counts estimates for 24h and month, ignoring deleted', () => {
    const items = [
      { SK: 'EST#a', status: 'active', createdAt: iso(2 * 60 * 60 * 1000) },
      { SK: 'EST#b', status: 'active', createdAt: iso(5 * DAY) },
      { SK: 'EST#c', status: 'deleted', createdAt: iso(1 * 60 * 60 * 1000) }
    ];
    const m = aggregate(items, now);
    expect(m.estimates24h).toBe(1);
    expect(m.estimatesMonth).toBe(2);
    expect(m.estimatesTotal).toBe(2);
  });

  test('topAction prioritizes past_due over trials', () => {
    expect(topAction({ pastDue: 2, trialExpiring3d: 5 })).toMatch(/PAST DUE/);
    expect(topAction({ pastDue: 0, trialExpiring3d: 3 })).toMatch(/expiring within 3 days/);
    expect(topAction({ pastDue: 0, trialExpiring3d: 0, trialing: 1 })).toMatch(/active trial/);
  });
});
