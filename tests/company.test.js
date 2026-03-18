const res = require('../handlers/lib/response');

// Mock dependencies
jest.mock('../handlers/lib/dynamo', () => ({
  get: jest.fn(),
  put: jest.fn(),
  update: jest.fn(),
  query: jest.fn(),
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

describe('company handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const companyProfile = {
    PK: 'COMPANY#comp-1',
    SK: 'PROFILE',
    name: 'Acme Fencing',
    email: 'info@acme.com',
    phone: '555-0100',
    accentColor: '#c0622e',
    tagline: 'Best fences in town',
    address: '123 Fence St',
    logoKey: 'logos/acme.png',
    subscriptionStatus: 'active',
    trialEndsAt: '2025-12-31T00:00:00.000Z'
  };

  describe('get', () => {
    test('returns company data on success', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.get.mockResolvedValue(companyProfile);

      const result = await company.get({});
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.id).toBe('comp-1');
      expect(body.name).toBe('Acme Fencing');
      expect(body.email).toBe('info@acme.com');
      expect(body.phone).toBe('555-0100');
      expect(body.subscriptionStatus).toBe('active');
    });

    test('returns 403 when no companyId', async () => {
      auth.getCompanyId.mockResolvedValue(null);

      const result = await company.get({});
      expect(result.statusCode).toBe(403);
    });

    test('returns 404 when company not found in DB', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.get.mockResolvedValue(undefined);

      const result = await company.get({});
      expect(result.statusCode).toBe(404);
    });

    test('does not leak PK/SK keys', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.get.mockResolvedValue(companyProfile);

      const result = await company.get({});
      const body = JSON.parse(result.body);
      expect(body.PK).toBeUndefined();
      expect(body.SK).toBeUndefined();
    });

    test('returns region and pricebook', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.get.mockResolvedValue({
        ...companyProfile,
        region: 'southeast',
        pricebook: { 'perFoot.wood': 30 }
      });

      const result = await company.get({});
      const body = JSON.parse(result.body);
      expect(body.region).toBe('southeast');
      expect(body.pricebook).toEqual({ 'perFoot.wood': 30 });
    });

    test('defaults region to national and pricebook to empty', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.get.mockResolvedValue(companyProfile);

      const result = await company.get({});
      const body = JSON.parse(result.body);
      expect(body.region).toBe('national');
      expect(body.pricebook).toEqual({});
    });
  });

  describe('update', () => {
    test('updates allowed fields', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.update.mockResolvedValue({
        ...companyProfile,
        name: 'New Name',
        phone: '555-9999'
      });

      const result = await company.update({
        body: JSON.stringify({ name: 'New Name', phone: '555-9999' })
      });
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.name).toBe('New Name');
      expect(body.phone).toBe('555-9999');
      expect(db.update).toHaveBeenCalledWith(
        'COMPANY#comp-1',
        'PROFILE',
        expect.objectContaining({
          name: 'New Name',
          phone: '555-9999',
          updatedAt: expect.any(String)
        })
      );
    });

    test('returns 403 when no companyId', async () => {
      auth.getCompanyId.mockResolvedValue(null);

      const result = await company.update({
        body: JSON.stringify({ name: 'test' })
      });
      expect(result.statusCode).toBe(403);
    });

    test('returns 400 when no valid fields', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');

      const result = await company.update({
        body: JSON.stringify({ email: 'hack@evil.com', subscriptionStatus: 'active' })
      });
      expect(result.statusCode).toBe(400);
    });

    test('filters out non-allowed fields', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.update.mockResolvedValue(companyProfile);

      await company.update({
        body: JSON.stringify({
          name: 'Good',
          email: 'should-be-filtered',
          subscriptionStatus: 'should-be-filtered'
        })
      });

      const updateCall = db.update.mock.calls[0][2];
      expect(updateCall.name).toBe('Good');
      expect(updateCall.email).toBeUndefined();
      expect(updateCall.subscriptionStatus).toBeUndefined();
    });

    test('allows updating region', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.update.mockResolvedValue({ ...companyProfile, region: 'california' });

      const result = await company.update({
        body: JSON.stringify({ region: 'california' })
      });
      expect(result.statusCode).toBe(200);
      expect(db.update).toHaveBeenCalledWith(
        'COMPANY#comp-1', 'PROFILE',
        expect.objectContaining({ region: 'california' })
      );
    });

    test('allows updating pricebook', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      const pb = { 'perFoot.wood': 30, 'wood.6.postCost': 18 };
      db.update.mockResolvedValue({ ...companyProfile, pricebook: pb });

      const result = await company.update({
        body: JSON.stringify({ pricebook: pb })
      });
      expect(result.statusCode).toBe(200);
      expect(db.update).toHaveBeenCalledWith(
        'COMPANY#comp-1', 'PROFILE',
        expect.objectContaining({ pricebook: pb })
      );
    });

    test('only updates provided fields', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.update.mockResolvedValue(companyProfile);

      await company.update({
        body: JSON.stringify({ tagline: 'New tagline' })
      });

      const updateCall = db.update.mock.calls[0][2];
      expect(updateCall.tagline).toBe('New tagline');
      expect(updateCall.name).toBeUndefined();
      expect(updateCall.phone).toBeUndefined();
    });

    test('handles missing body gracefully', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');

      const result = await company.update({ body: undefined });
      expect(result.statusCode).toBe(400);
    });

    test('sets updatedAt timestamp', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.update.mockResolvedValue(companyProfile);

      const before = new Date().toISOString();
      await company.update({
        body: JSON.stringify({ name: 'Test' })
      });
      const after = new Date().toISOString();

      const updateCall = db.update.mock.calls[0][2];
      expect(updateCall.updatedAt).toBeDefined();
      expect(updateCall.updatedAt >= before).toBe(true);
      expect(updateCall.updatedAt <= after).toBe(true);
    });
  });
});
