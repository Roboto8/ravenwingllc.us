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
