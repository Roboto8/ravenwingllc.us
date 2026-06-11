// Pricebook validation on company.update — quotes are money, so the
// backend must reject non-numeric or absurd values before they poison
// every estimate the contractor sends.
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
const company = require('../handlers/company');

function updateEvent(pricebook) {
  return { body: JSON.stringify({ pricebook }) };
}

describe('company.update pricebook validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.getCompanyId.mockResolvedValue('comp-1');
    db.update.mockImplementation(async (pk, sk, updates) => ({ PK: pk, SK: sk, ...updates }));
    db.get.mockResolvedValue({ PK: 'COMPANY#comp-1', SK: 'PROFILE' });
  });

  test('accepts a valid flat numeric pricebook', async () => {
    const res = await company.update(updateEvent({
      'wood.6.postCost': 18.5,
      'labor.wood.6': 12,
      'labor.gate': 75,
      'markup.percent': 20,
      'markup.jobMin': 1500
    }));
    expect(res.statusCode).toBe(200);
  });

  test('rejects non-numeric values', async () => {
    const res = await company.update(updateEvent({ 'wood.6.postCost': 'eighteen' }));
    expect(res.statusCode).toBe(400);
  });

  test('rejects negative, NaN-producing, and absurd values', async () => {
    expect((await company.update(updateEvent({ 'labor.gate': -5 }))).statusCode).toBe(400);
    expect((await company.update(updateEvent({ 'labor.gate': null }))).statusCode).toBe(400);
    expect((await company.update(updateEvent({ 'labor.gate': 2000000 }))).statusCode).toBe(400);
  });

  test('rejects arrays and oversized key counts', async () => {
    expect((await company.update(updateEvent([1, 2]))).statusCode).toBe(400);
    const big = {};
    for (let i = 0; i < 501; i++) big['k' + i] = 1;
    expect((await company.update(updateEvent(big))).statusCode).toBe(400);
  });

  test('rejects keys longer than 64 chars', async () => {
    const res = await company.update(updateEvent({ ['x'.repeat(65)]: 1 }));
    expect(res.statusCode).toBe(400);
  });
});

// benchmarkOptOut: companies can withdraw their estimates from the anonymized
// market-rollup corpus. Must be a real boolean, and is only returned to users
// who can already see company-confidential fields.
describe('company benchmarkOptOut', () => {
  const { checkPermission } = require('../handlers/roles');

  beforeEach(() => {
    jest.clearAllMocks();
    auth.getCompanyId.mockResolvedValue('comp-1');
    db.update.mockImplementation(async (pk, sk, updates) => ({ PK: pk, SK: sk, ...updates }));
    db.get.mockResolvedValue({ PK: 'COMPANY#comp-1', SK: 'PROFILE' });
  });

  test('update accepts true and persists it', async () => {
    const res = await company.update({ body: JSON.stringify({ benchmarkOptOut: true }) });
    expect(res.statusCode).toBe(200);
    expect(db.update.mock.calls[0][2].benchmarkOptOut).toBe(true);
  });

  test('update accepts false (opting back in)', async () => {
    const res = await company.update({ body: JSON.stringify({ benchmarkOptOut: false }) });
    expect(res.statusCode).toBe(200);
    expect(db.update.mock.calls[0][2].benchmarkOptOut).toBe(false);
  });

  test('update rejects non-boolean values', async () => {
    expect((await company.update({ body: JSON.stringify({ benchmarkOptOut: 'yes' }) })).statusCode).toBe(400);
    expect((await company.update({ body: JSON.stringify({ benchmarkOptOut: 1 }) })).statusCode).toBe(400);
    expect((await company.update({ body: JSON.stringify({ benchmarkOptOut: null }) })).statusCode).toBe(400);
    expect(db.update).not.toHaveBeenCalled();
  });

  test('get returns benchmarkOptOut for authorized users', async () => {
    db.get.mockResolvedValue({ PK: 'COMPANY#comp-1', SK: 'PROFILE', name: 'Acme', benchmarkOptOut: true });
    const res = await company.get({});
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).benchmarkOptOut).toBe(true);
  });

  test('get defaults benchmarkOptOut to false when unset', async () => {
    db.get.mockResolvedValue({ PK: 'COMPANY#comp-1', SK: 'PROFILE', name: 'Acme' });
    const res = await company.get({});
    expect(JSON.parse(res.body).benchmarkOptOut).toBe(false);
  });

  test('get omits benchmarkOptOut for members without confidential access', async () => {
    // company.get checks company.edit then billing.manage — deny both once
    checkPermission.mockResolvedValueOnce(false).mockResolvedValueOnce(false);
    db.get.mockResolvedValue({ PK: 'COMPANY#comp-1', SK: 'PROFILE', name: 'Acme', benchmarkOptOut: true });
    const res = await company.get({});
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).benchmarkOptOut).toBeUndefined();
  });
});
