/**
 * Additional edge case tests for roles handler
 */
jest.mock('../handlers/lib/dynamo', () => ({
  get: jest.fn(),
  put: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  query: jest.fn(),
  queryGSI: jest.fn()
}));

jest.mock('../handlers/lib/auth', () => ({
  getUser: jest.fn(),
  getCompanyId: jest.fn()
}));

const db = require('../handlers/lib/dynamo');
const auth = require('../handlers/lib/auth');
const roles = require('../handlers/roles');

describe('roles handler - edge cases', () => {
  beforeEach(() => jest.clearAllMocks());

  function mockOwnerUser() {
    auth.getUser.mockReturnValue({ sub: 'owner-sub' });
    db.queryGSI.mockResolvedValue([{ role: 'owner', GSI1SK: 'COMPANY#comp-1' }]);
  }

  // ===== CREATE - name sanitization =====
  describe('create - name sanitization', () => {
    test('strips special characters from role name', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      mockOwnerUser();
      db.put.mockResolvedValue({});

      const result = await roles.create({
        body: JSON.stringify({
          name: 'My Role! @#$',
          permissions: ['estimates.view']
        })
      });
      const body = JSON.parse(result.body);
      expect(body.name).toBe('myrole');
    });

    test('converts name to lowercase', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      mockOwnerUser();
      db.put.mockResolvedValue({});

      const result = await roles.create({
        body: JSON.stringify({ name: 'ADMIN', permissions: [] })
      });
      const body = JSON.parse(result.body);
      expect(body.name).toBe('admin');
    });

    test('rejects name that becomes empty after sanitization', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      mockOwnerUser();

      const result = await roles.create({
        body: JSON.stringify({ name: '!@#$', permissions: [] })
      });
      expect(result.statusCode).toBe(400);
    });

    test('rejects name that becomes 1 char after sanitization', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      mockOwnerUser();

      const result = await roles.create({
        body: JSON.stringify({ name: 'a!@#', permissions: [] })
      });
      expect(result.statusCode).toBe(400);
    });

    test('allows hyphens in name', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      mockOwnerUser();
      db.put.mockResolvedValue({});

      const result = await roles.create({
        body: JSON.stringify({ name: 'field-tech', permissions: ['estimates.view'] })
      });
      const body = JSON.parse(result.body);
      expect(body.name).toBe('field-tech');
    });

    test('allows numbers in name', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      mockOwnerUser();
      db.put.mockResolvedValue({});

      const result = await roles.create({
        body: JSON.stringify({ name: 'admin2', permissions: [] })
      });
      const body = JSON.parse(result.body);
      expect(body.name).toBe('admin2');
    });

    test('rejects member as role name', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      mockOwnerUser();

      const result = await roles.create({
        body: JSON.stringify({ name: 'member', permissions: [] })
      });
      expect(result.statusCode).toBe(400);
    });

    test('uses default color when not provided', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      mockOwnerUser();
      db.put.mockResolvedValue({});

      const result = await roles.create({
        body: JSON.stringify({ name: 'newrole', permissions: [] })
      });
      const body = JSON.parse(result.body);
      expect(body.color).toBe('#6b6052');
    });

    test('uses provided color', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      mockOwnerUser();
      db.put.mockResolvedValue({});

      const result = await roles.create({
        body: JSON.stringify({ name: 'newrole', permissions: [], color: '#ff0000' })
      });
      const body = JSON.parse(result.body);
      expect(body.color).toBe('#ff0000');
    });

    test('filters out all invalid permissions', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      mockOwnerUser();
      db.put.mockResolvedValue({});

      const result = await roles.create({
        body: JSON.stringify({
          name: 'badrole',
          permissions: ['admin.all', 'root.access', 'super.user']
        })
      });
      const body = JSON.parse(result.body);
      expect(body.permissions).toEqual([]);
    });

    test('returns 403 when no auth', async () => {
      auth.getCompanyId.mockResolvedValue(null);
      const result = await roles.create({
        body: JSON.stringify({ name: 'test', permissions: [] })
      });
      expect(result.statusCode).toBe(403);
    });

    test('handles null body', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      mockOwnerUser();

      const result = await roles.create({ body: null });
      expect(result.statusCode).toBe(400);
    });
  });

  // ===== ASSIGN - edge cases =====
  describe('assign - edge cases', () => {
    test('normalizes email to lowercase', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      mockOwnerUser();
      db.query.mockResolvedValue({
        items: [{ email: 'john@test.com', PK: 'COMPANY#comp-1', SK: 'USER#u1', role: 'member' }]
      });
      db.update.mockResolvedValue({});

      const result = await roles.assign({
        body: JSON.stringify({ email: '  John@Test.COM  ', role: 'estimator' })
      });
      expect(result.statusCode).toBe(200);
    });

    test('normalizes role to lowercase', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      mockOwnerUser();
      db.query.mockResolvedValue({
        items: [{ email: 'john@test.com', PK: 'COMPANY#comp-1', SK: 'USER#u1', role: 'member' }]
      });
      db.update.mockResolvedValue({});

      const result = await roles.assign({
        body: JSON.stringify({ email: 'john@test.com', role: 'ESTIMATOR' })
      });
      const body = JSON.parse(result.body);
      expect(body.role).toBe('estimator');
    });

    test('rejects when both email and role are empty', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      mockOwnerUser();

      const result = await roles.assign({
        body: JSON.stringify({ email: '', role: '' })
      });
      expect(result.statusCode).toBe(400);
    });

    test('rejects when role is missing', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      mockOwnerUser();

      const result = await roles.assign({
        body: JSON.stringify({ email: 'john@test.com' })
      });
      expect(result.statusCode).toBe(400);
    });
  });

  // ===== UPDATE - edge cases =====
  describe('update - edge cases', () => {
    test('filters invalid permissions in update', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      mockOwnerUser();
      db.update.mockResolvedValue({});

      await roles.update({
        pathParameters: { name: 'estimator' },
        body: JSON.stringify({
          permissions: ['estimates.view', 'fake.permission']
        })
      });

      const updateCall = db.update.mock.calls[0][2];
      expect(updateCall.permissions).toEqual(['estimates.view']);
    });

    test('sets updatedAt on update', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      mockOwnerUser();
      db.update.mockResolvedValue({});

      await roles.update({
        pathParameters: { name: 'estimator' },
        body: JSON.stringify({ color: '#00ff00' })
      });

      const updateCall = db.update.mock.calls[0][2];
      expect(updateCall.updatedAt).toBeDefined();
    });
  });

  // ===== REMOVE - reassigns all members =====
  describe('remove - member reassignment', () => {
    test('does not update members who already have member role', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      mockOwnerUser();
      db.query.mockResolvedValue({
        items: [
          { PK: 'COMPANY#comp-1', SK: 'USER#u1', role: 'member' },
          { PK: 'COMPANY#comp-1', SK: 'USER#u2', role: 'member' }
        ]
      });
      db.remove.mockResolvedValue({});

      await roles.remove({ pathParameters: { name: 'estimator' } });

      // No updates since nobody had the 'estimator' role
      expect(db.update).not.toHaveBeenCalled();
      expect(db.remove).toHaveBeenCalledWith('COMPANY#comp-1', 'ROLE#estimator');
    });

    test('updates multiple members with deleted role', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      mockOwnerUser();
      db.query.mockResolvedValue({
        items: [
          { PK: 'COMPANY#comp-1', SK: 'USER#u1', role: 'estimator' },
          { PK: 'COMPANY#comp-1', SK: 'USER#u2', role: 'estimator' },
          { PK: 'COMPANY#comp-1', SK: 'USER#u3', role: 'owner' }
        ]
      });
      db.update.mockResolvedValue({});
      db.remove.mockResolvedValue({});

      await roles.remove({ pathParameters: { name: 'estimator' } });

      expect(db.update).toHaveBeenCalledTimes(2);
      expect(db.update).toHaveBeenCalledWith('COMPANY#comp-1', 'USER#u1', { role: 'member' });
      expect(db.update).toHaveBeenCalledWith('COMPANY#comp-1', 'USER#u2', { role: 'member' });
    });
  });

  // ===== checkPermission - all paths =====
  describe('checkPermission via create', () => {
    test('custom role with team.roles permission can create roles', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      auth.getUser.mockReturnValue({ sub: 'admin-sub' });
      db.queryGSI.mockResolvedValue([{ role: 'admin', GSI1SK: 'COMPANY#comp-1' }]);
      db.get.mockResolvedValue({ permissions: ['team.roles'] });
      db.put.mockResolvedValue({});

      const result = await roles.create({
        body: JSON.stringify({ name: 'newrole', permissions: ['estimates.view'] })
      });
      expect(result.statusCode).toBe(201);
    });

    test('custom role without team.roles permission is denied', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      auth.getUser.mockReturnValue({ sub: 'limited-sub' });
      db.queryGSI.mockResolvedValue([{ role: 'viewer', GSI1SK: 'COMPANY#comp-1' }]);
      db.get.mockResolvedValue({ permissions: ['estimates.view'] });

      const result = await roles.create({
        body: JSON.stringify({ name: 'newrole', permissions: [] })
      });
      expect(result.statusCode).toBe(403);
    });

    test('custom role with null permissions array is denied', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      auth.getUser.mockReturnValue({ sub: 'custom-sub' });
      db.queryGSI.mockResolvedValue([{ role: 'broken-role', GSI1SK: 'COMPANY#comp-1' }]);
      db.get.mockResolvedValue({ permissions: null });

      const result = await roles.create({
        body: JSON.stringify({ name: 'newrole', permissions: [] })
      });
      expect(result.statusCode).toBe(403);
    });
  });

  // ===== ALL_PERMISSIONS exported correctly =====
  describe('ALL_PERMISSIONS', () => {
    test('includes all expected permissions', () => {
      expect(roles.ALL_PERMISSIONS).toContain('estimates.create');
      expect(roles.ALL_PERMISSIONS).toContain('estimates.edit');
      expect(roles.ALL_PERMISSIONS).toContain('estimates.delete');
      expect(roles.ALL_PERMISSIONS).toContain('estimates.view');
      expect(roles.ALL_PERMISSIONS).toContain('team.invite');
      expect(roles.ALL_PERMISSIONS).toContain('team.remove');
      expect(roles.ALL_PERMISSIONS).toContain('team.roles');
      expect(roles.ALL_PERMISSIONS).toContain('billing.manage');
      expect(roles.ALL_PERMISSIONS).toContain('company.edit');
      expect(roles.ALL_PERMISSIONS).toContain('export.data');
    });

    test('has exactly 10 permissions', () => {
      expect(roles.ALL_PERMISSIONS).toHaveLength(10);
    });
  });
});
