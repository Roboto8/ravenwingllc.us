/**
 * Tests for company handler validation branches
 * Covers string length limits, pricebook validation, and accentColor format.
 */
jest.mock('../handlers/lib/dynamo', () => ({
  get: jest.fn(),
  put: jest.fn(),
  update: jest.fn(),
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

describe('company handler - validation branches', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.getCompanyId.mockResolvedValue('comp-1');
  });

  describe('string field length validation', () => {
    test('rejects name longer than 500 characters', async () => {
      const result = await company.update({
        body: JSON.stringify({ name: 'x'.repeat(501) })
      });
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toMatch(/500 characters/);
    });

    test('accepts name at exactly 500 characters', async () => {
      db.update.mockResolvedValue({ name: 'x'.repeat(500) });

      const result = await company.update({
        body: JSON.stringify({ name: 'x'.repeat(500) })
      });
      expect(result.statusCode).toBe(200);
    });

    test('rejects phone longer than 500 characters', async () => {
      const result = await company.update({
        body: JSON.stringify({ phone: '5'.repeat(501) })
      });
      expect(result.statusCode).toBe(400);
    });

    test('rejects tagline longer than 500 characters', async () => {
      const result = await company.update({
        body: JSON.stringify({ tagline: 't'.repeat(501) })
      });
      expect(result.statusCode).toBe(400);
    });

    test('rejects address longer than 500 characters', async () => {
      const result = await company.update({
        body: JSON.stringify({ address: 'a'.repeat(501) })
      });
      expect(result.statusCode).toBe(400);
    });

    test('rejects logoKey longer than 500 characters', async () => {
      const result = await company.update({
        body: JSON.stringify({ logoKey: 'k'.repeat(501) })
      });
      expect(result.statusCode).toBe(400);
    });

    test('rejects language longer than 500 characters', async () => {
      const result = await company.update({
        body: JSON.stringify({ language: 'l'.repeat(501) })
      });
      expect(result.statusCode).toBe(400);
    });

    test('does not validate length for non-string fields like pricebook', async () => {
      db.update.mockResolvedValue({ pricebook: { a: 1 } });

      const result = await company.update({
        body: JSON.stringify({ pricebook: { a: 1 } })
      });
      expect(result.statusCode).toBe(200);
    });
  });

  describe('pricebook size validation', () => {
    test('rejects pricebook larger than 10000 characters when serialized', async () => {
      const largePricebook = {};
      for (let i = 0; i < 500; i++) {
        largePricebook[`material.type.${i}.longKeyName`] = 99999.99;
      }
      // Verify our test data is actually > 10000 chars
      expect(JSON.stringify(largePricebook).length).toBeGreaterThan(10000);

      const result = await company.update({
        body: JSON.stringify({ pricebook: largePricebook })
      });
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toMatch(/too large/);
    });

    test('accepts pricebook under 10000 characters', async () => {
      const smallPricebook = { 'perFoot.wood': 30, 'perFoot.vinyl': 45 };
      db.update.mockResolvedValue({ pricebook: smallPricebook });

      const result = await company.update({
        body: JSON.stringify({ pricebook: smallPricebook })
      });
      expect(result.statusCode).toBe(200);
    });

    test('accepts pricebook at boundary size', async () => {
      // Build a pricebook just under 10000 chars
      const pricebook = {};
      for (let i = 0; i < 200; i++) {
        pricebook[`key${i}`] = i;
      }
      expect(JSON.stringify(pricebook).length).toBeLessThan(10000);
      db.update.mockResolvedValue({ pricebook });

      const result = await company.update({
        body: JSON.stringify({ pricebook })
      });
      expect(result.statusCode).toBe(200);
    });
  });

  describe('accentColor format validation', () => {
    test('rejects non-hex accentColor', async () => {
      const result = await company.update({
        body: JSON.stringify({ accentColor: 'red' })
      });
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toMatch(/hex color/);
    });

    test('rejects accentColor without # prefix', async () => {
      const result = await company.update({
        body: JSON.stringify({ accentColor: 'ff5500' })
      });
      expect(result.statusCode).toBe(400);
    });

    test('rejects accentColor with invalid hex chars', async () => {
      const result = await company.update({
        body: JSON.stringify({ accentColor: '#gghhii' })
      });
      expect(result.statusCode).toBe(400);
    });

    test('rejects numeric accentColor', async () => {
      const result = await company.update({
        body: JSON.stringify({ accentColor: 12345 })
      });
      expect(result.statusCode).toBe(400);
    });

    test('accepts valid 3-char hex color', async () => {
      db.update.mockResolvedValue({ accentColor: '#f00' });

      const result = await company.update({
        body: JSON.stringify({ accentColor: '#f00' })
      });
      expect(result.statusCode).toBe(200);
    });

    test('accepts valid 6-char hex color', async () => {
      db.update.mockResolvedValue({ accentColor: '#ff5500' });

      const result = await company.update({
        body: JSON.stringify({ accentColor: '#ff5500' })
      });
      expect(result.statusCode).toBe(200);
    });

    test('accepts valid 8-char hex color (with alpha)', async () => {
      db.update.mockResolvedValue({ accentColor: '#ff550080' });

      const result = await company.update({
        body: JSON.stringify({ accentColor: '#ff550080' })
      });
      expect(result.statusCode).toBe(200);
    });

    test('accepts empty string for accentColor (reset)', async () => {
      db.update.mockResolvedValue({ accentColor: '' });

      const result = await company.update({
        body: JSON.stringify({ accentColor: '' })
      });
      expect(result.statusCode).toBe(200);
    });
  });

  describe('permission check for update', () => {
    test('returns 403 when user lacks company.edit permission', async () => {
      const { checkPermission } = require('../handlers/roles');
      checkPermission.mockResolvedValue(false);

      const result = await company.update({
        body: JSON.stringify({ name: 'Test' })
      });
      expect(result.statusCode).toBe(403);
    });
  });
});
