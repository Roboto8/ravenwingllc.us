/**
 * Tier Protection Tests
 *
 * Validates that feature gating works correctly for each tier:
 * - Starter (free): 2 estimates/month (+1 share bonus), no PDF, no approvals
 * - Builder ($15): unlimited estimates, PDF export, no approvals
 * - Contractor ($35): unlimited estimates, PDF export, customer approvals
 */
jest.mock('../handlers/lib/dynamo', () => ({
  get: jest.fn(),
  put: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  query: jest.fn(),
  findById: jest.fn(),
  queryGSI: jest.fn()
}));
jest.mock('../handlers/lib/auth', () => ({
  getUser: jest.fn(),
  getCompanyId: jest.fn()
}));
jest.mock('../handlers/roles', () => ({
  checkPermission: jest.fn().mockResolvedValue(true),
  ALL_PERMISSIONS: []
}));

const db = require('../handlers/lib/dynamo');
const auth = require('../handlers/lib/auth');
const estimates = require('../handlers/estimates');

function makeEvent(body = {}) {
  return { body: JSON.stringify(body) };
}

function makeEstimates(count, monthOffset = 0) {
  const now = new Date();
  const month = new Date(now.getFullYear(), now.getMonth() + monthOffset, 15);
  return Array.from({ length: count }, (_, i) => ({
    PK: 'COMPANY#comp-1', SK: 'EST#' + month.toISOString() + '#est-' + i,
    id: 'est-' + i, status: 'draft', createdAt: month.toISOString()
  }));
}

describe('Tier protection — Starter (free)', () => {
  beforeEach(() => jest.clearAllMocks());

  const freeCompany = { subscriptionStatus: 'free', tier: 'free' };

  test('allows first estimate', async () => {
    auth.getCompanyId.mockResolvedValue('comp-1');
    db.get.mockResolvedValue(freeCompany);
    db.query.mockResolvedValue({ items: [], nextKey: null });
    db.put.mockResolvedValue({});

    const result = await estimates.create(makeEvent({ customerName: 'Test' }));
    expect(result.statusCode).toBe(201);
  });

  test('allows second estimate', async () => {
    auth.getCompanyId.mockResolvedValue('comp-1');
    db.get.mockResolvedValue(freeCompany);
    db.query.mockResolvedValue({ items: makeEstimates(1), nextKey: null });
    db.put.mockResolvedValue({});

    const result = await estimates.create(makeEvent({ customerName: 'Test' }));
    expect(result.statusCode).toBe(201);
  });

  test('blocks third estimate in same month', async () => {
    auth.getCompanyId.mockResolvedValue('comp-1');
    db.get.mockResolvedValue(freeCompany);
    db.query.mockResolvedValue({ items: makeEstimates(2), nextKey: null });

    const result = await estimates.create(makeEvent({ customerName: 'Test' }));
    expect(result.statusCode).toBe(403);
    expect(JSON.parse(result.body).error).toContain('Starter plan limit');
    expect(JSON.parse(result.body).error).toContain('2 estimates/month');
  });

  test('does not count deleted estimates toward limit', async () => {
    auth.getCompanyId.mockResolvedValue('comp-1');
    db.get.mockResolvedValue(freeCompany);
    const items = makeEstimates(2);
    items[0].status = 'deleted';
    db.query.mockResolvedValue({ items, nextKey: null });
    db.put.mockResolvedValue({});

    const result = await estimates.create(makeEvent({ customerName: 'Test' }));
    expect(result.statusCode).toBe(201);
  });

  test('does not count previous month estimates toward limit', async () => {
    auth.getCompanyId.mockResolvedValue('comp-1');
    db.get.mockResolvedValue(freeCompany);
    // 3 estimates from last month (over limit), 0 from this month — should still allow
    db.query.mockResolvedValue({ items: makeEstimates(3, -1), nextKey: null });
    db.put.mockResolvedValue({});

    const result = await estimates.create(makeEvent({ customerName: 'Test' }));
    expect(result.statusCode).toBe(201);
  });
});

describe('Tier protection — Builder (paid)', () => {
  beforeEach(() => jest.clearAllMocks());

  const builderCompany = { subscriptionStatus: 'active', tier: 'builder' };

  test('allows unlimited estimates', async () => {
    auth.getCompanyId.mockResolvedValue('comp-1');
    db.get.mockResolvedValue(builderCompany);
    db.put.mockResolvedValue({});

    const result = await estimates.create(makeEvent({ customerName: 'Test' }));
    expect(result.statusCode).toBe(201);
  });

  test('no monthly limit check for Builder', async () => {
    auth.getCompanyId.mockResolvedValue('comp-1');
    db.get.mockResolvedValue(builderCompany);
    db.put.mockResolvedValue({});

    await estimates.create(makeEvent({ customerName: 'Test' }));
    // db.query should NOT be called (no free tier limit check)
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe('Tier protection — Contractor (paid)', () => {
  beforeEach(() => jest.clearAllMocks());

  const contractorCompany = { subscriptionStatus: 'active', tier: 'contractor' };

  test('allows unlimited estimates', async () => {
    auth.getCompanyId.mockResolvedValue('comp-1');
    db.get.mockResolvedValue(contractorCompany);
    db.put.mockResolvedValue({});

    const result = await estimates.create(makeEvent({ customerName: 'Test' }));
    expect(result.statusCode).toBe(201);
  });

  test('no monthly limit check for Contractor', async () => {
    auth.getCompanyId.mockResolvedValue('comp-1');
    db.get.mockResolvedValue(contractorCompany);
    db.put.mockResolvedValue({});

    await estimates.create(makeEvent({ customerName: 'Test' }));
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe('Tier protection — expired/canceled users get free tier limits', () => {
  beforeEach(() => jest.clearAllMocks());

  test('expired trial user can create (within limit)', async () => {
    auth.getCompanyId.mockResolvedValue('comp-1');
    db.get.mockResolvedValue({
      subscriptionStatus: 'trialing',
      trialEndsAt: new Date(0).toISOString()
    });
    db.query.mockResolvedValue({ items: [], nextKey: null });
    db.put.mockResolvedValue({});

    const result = await estimates.create(makeEvent({ customerName: 'Test' }));
    expect(result.statusCode).toBe(201);
  });

  test('expired trial user blocked at limit', async () => {
    auth.getCompanyId.mockResolvedValue('comp-1');
    db.get.mockResolvedValue({
      subscriptionStatus: 'trialing',
      trialEndsAt: new Date(0).toISOString()
    });
    db.query.mockResolvedValue({ items: makeEstimates(2), nextKey: null });

    const result = await estimates.create(makeEvent({ customerName: 'Test' }));
    expect(result.statusCode).toBe(403);
  });

  test('canceled user can create (within limit)', async () => {
    auth.getCompanyId.mockResolvedValue('comp-1');
    db.get.mockResolvedValue({
      subscriptionStatus: 'canceled',
      tier: 'free'
    });
    db.query.mockResolvedValue({ items: makeEstimates(1), nextKey: null });
    db.put.mockResolvedValue({});

    const result = await estimates.create(makeEvent({ customerName: 'Test' }));
    expect(result.statusCode).toBe(201);
  });

  test('canceled user blocked at limit', async () => {
    auth.getCompanyId.mockResolvedValue('comp-1');
    db.get.mockResolvedValue({
      subscriptionStatus: 'canceled',
      tier: 'free'
    });
    db.query.mockResolvedValue({ items: makeEstimates(2), nextKey: null });

    const result = await estimates.create(makeEvent({ customerName: 'Test' }));
    expect(result.statusCode).toBe(403);
  });

  test('past_due user can create without limit (grace period)', async () => {
    auth.getCompanyId.mockResolvedValue('comp-1');
    db.get.mockResolvedValue({
      subscriptionStatus: 'past_due',
      tier: 'builder'
    });
    db.put.mockResolvedValue({});

    const result = await estimates.create(makeEvent({ customerName: 'Test' }));
    expect(result.statusCode).toBe(201);
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe('Tier protection — share bonus', () => {
  beforeEach(() => jest.clearAllMocks());

  const freeCompany = { subscriptionStatus: 'free', tier: 'free' };

  function currentMonth() {
    const now = new Date();
    return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  }

  test('share bonus grants limit of 3 instead of 2 for current month', async () => {
    auth.getCompanyId.mockResolvedValue('comp-1');
    db.get.mockResolvedValue({ ...freeCompany, shareBonusMonth: currentMonth() });
    db.query.mockResolvedValue({ items: makeEstimates(2), nextKey: null });
    db.put.mockResolvedValue({});

    const result = await estimates.create(makeEvent({ customerName: 'Bonus User' }));
    expect(result.statusCode).toBe(201);
  });

  test('share bonus does not help when at 3 estimates', async () => {
    auth.getCompanyId.mockResolvedValue('comp-1');
    db.get.mockResolvedValue({ ...freeCompany, shareBonusMonth: currentMonth() });
    db.query.mockResolvedValue({ items: makeEstimates(3), nextKey: null });

    const result = await estimates.create(makeEvent({ customerName: 'Over Limit' }));
    expect(result.statusCode).toBe(403);
    expect(JSON.parse(result.body).error).toContain('3 estimates/month');
  });

  test('share bonus from different month does not grant extra estimate', async () => {
    auth.getCompanyId.mockResolvedValue('comp-1');
    db.get.mockResolvedValue({ ...freeCompany, shareBonusMonth: '2025-01' });
    db.query.mockResolvedValue({ items: makeEstimates(2), nextKey: null });

    const result = await estimates.create(makeEvent({ customerName: 'Old Bonus' }));
    expect(result.statusCode).toBe(403);
    expect(JSON.parse(result.body).error).toContain('2 estimates/month');
  });
});

describe('Tier protection — frontend requireTier validation', () => {
  const puppeteer = require('puppeteer-core');
  const path = require('path');
  const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const INDEX_URL = 'file:///' + path.resolve(__dirname, '../client/preview/index.html').replace(/\\/g, '/');
  const delay = ms => new Promise(r => setTimeout(r, ms));

  let browser;
  beforeAll(async () => {
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH, headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security']
    });
  }, 30000);
  afterAll(async () => { if (browser) await browser.close(); });

  async function createPage() {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.goto(INDEX_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await delay(1000);
    await page.evaluate(() => {
      localStorage.setItem('fc_onboarded', 'true');
      localStorage.setItem('fc_quickstart_seen', '1');
      localStorage.setItem('fc_visited', '1');
    });
    await delay(300);
    return page;
  }

  test('_tierRank has correct values', async () => {
    const page = await createPage();
    const ranks = await page.evaluate(() => _tierRank);
    expect(ranks).toEqual({ free: 0, builder: 1, contractor: 2, pro: 2 });
    await page.close();
  }, 20000);

  test('tier rank: free < builder < contractor', async () => {
    const page = await createPage();
    const result = await page.evaluate(() => {
      return {
        freeRank: _tierRank['free'],
        builderRank: _tierRank['builder'],
        contractorRank: _tierRank['contractor'],
        freeBelow: _tierRank['free'] < _tierRank['builder'],
        builderBelow: _tierRank['builder'] < _tierRank['contractor']
      };
    });
    expect(result.freeRank).toBe(0);
    expect(result.builderRank).toBe(1);
    expect(result.contractorRank).toBe(2);
    expect(result.freeBelow).toBe(true);
    expect(result.builderBelow).toBe(true);
    await page.close();
  }, 20000);

  test('requireTier function exists and is callable', async () => {
    const page = await createPage();
    const result = await page.evaluate(() => typeof requireTier === 'function');
    expect(result).toBe(true);
    await page.close();
  }, 20000);

  test('paywall modal exists in DOM', async () => {
    const page = await createPage();
    const result = await page.evaluate(() => {
      var modal = document.getElementById('paywall-modal');
      var title = document.getElementById('paywall-title');
      var btn = document.getElementById('paywall-subscribe-btn');
      return {
        modalExists: !!modal,
        titleExists: !!title,
        btnExists: !!btn
      };
    });
    expect(result.modalExists).toBe(true);
    expect(result.titleExists).toBe(true);
    expect(result.btnExists).toBe(true);
    await page.close();
  }, 20000);

  test('pricing cards show correct tier names and prices', async () => {
    const page = await createPage();
    const result = await page.evaluate(() => {
      var starter = document.getElementById('plan-starter');
      var pro = document.getElementById('plan-pro');
      return {
        starterExists: !!starter,
        proExists: !!pro,
        starterText: starter ? starter.textContent : '',
        proText: pro ? pro.textContent : ''
      };
    });
    expect(result.starterExists).toBe(true);
    expect(result.proExists).toBe(true);
    expect(result.starterText).toContain('Starter');
    expect(result.proText).toContain('$4.99');
    await page.close();
  }, 20000);
});
