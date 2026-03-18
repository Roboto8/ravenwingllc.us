/**
 * Integration Test: Role Creation → Assignment → Permission Gating
 *
 * Tests creating custom roles, assigning them to team members,
 * and verifying that permission checks gate access correctly.
 */
const { MockDB } = require('../helpers/mock-db');
const mockDB = new MockDB();

jest.mock('../../handlers/lib/dynamo', () => mockDB);
jest.mock('../../handlers/lib/auth', () => ({
  getUser: jest.fn(),
  getCompanyId: jest.fn()
}));

const auth = require('../../handlers/lib/auth');
const roles = require('../../handlers/roles');

describe('Integration: Roles & Permissions', () => {
  const COMPANY_ID = 'comp-roles-integ';
  const OWNER_SUB = 'owner-sub';
  const MEMBER_SUB = 'member-sub';

  beforeAll(() => {
    mockDB.seed([
      {
        PK: `COMPANY#${COMPANY_ID}`,
        SK: 'PROFILE',
        name: 'Roles Test Co',
        email: 'owner@roles.com',
        subscriptionStatus: 'active'
      },
      {
        PK: `COMPANY#${COMPANY_ID}`,
        SK: `USER#${OWNER_SUB}`,
        GSI1PK: `USER#${OWNER_SUB}`,
        GSI1SK: `COMPANY#${COMPANY_ID}`,
        email: 'owner@roles.com',
        role: 'owner',
        createdAt: '2026-01-01T00:00:00.000Z'
      },
      {
        PK: `COMPANY#${COMPANY_ID}`,
        SK: `USER#${MEMBER_SUB}`,
        GSI1PK: `USER#${MEMBER_SUB}`,
        GSI1SK: `COMPANY#${COMPANY_ID}`,
        email: 'member@roles.com',
        role: 'member',
        createdAt: '2026-01-02T00:00:00.000Z'
      }
    ]);
  });

  beforeEach(() => {
    auth.getCompanyId.mockResolvedValue(COMPANY_ID);
  });

  // --- Owner creates roles ---

  test('1. owner can list built-in roles', async () => {
    auth.getUser.mockReturnValue({ sub: OWNER_SUB });

    const result = await roles.list({});
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.roles.length).toBeGreaterThanOrEqual(2); // owner + member
    expect(body.allPermissions).toBeDefined();
  });

  test('2. owner creates custom "estimator" role', async () => {
    auth.getUser.mockReturnValue({ sub: OWNER_SUB });

    const result = await roles.create({
      body: JSON.stringify({
        name: 'estimator',
        color: '#336699',
        permissions: ['estimates.create', 'estimates.edit', 'estimates.view']
      })
    });

    expect(result.statusCode).toBe(201);
    const body = JSON.parse(result.body);
    expect(body.name).toBe('estimator');
    expect(body.permissions).toEqual(['estimates.create', 'estimates.edit', 'estimates.view']);
    expect(body.builtIn).toBe(false);
  });

  test('3. custom role appears in role list', async () => {
    auth.getUser.mockReturnValue({ sub: OWNER_SUB });

    const result = await roles.list({});
    const body = JSON.parse(result.body);

    const estimator = body.roles.find(r => r.name === 'estimator');
    expect(estimator).toBeDefined();
    expect(estimator.color).toBe('#336699');
    expect(estimator.builtIn).toBe(false);
  });

  test('4. owner assigns "estimator" role to member', async () => {
    auth.getUser.mockReturnValue({ sub: OWNER_SUB });

    const result = await roles.assign({
      body: JSON.stringify({
        email: 'member@roles.com',
        role: 'estimator'
      })
    });

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.role).toBe('estimator');
  });

  // --- Member with "estimator" role tries to act ---

  test('5. member with estimator role is denied role management', async () => {
    auth.getUser.mockReturnValue({ sub: MEMBER_SUB });

    const result = await roles.create({
      body: JSON.stringify({
        name: 'hacker-role',
        permissions: ['billing.manage']
      })
    });

    // Estimator role doesn't include team.roles permission
    expect(result.statusCode).toBe(403);
  });

  // --- Owner updates role permissions ---

  test('6. owner adds team.roles permission to estimator', async () => {
    auth.getUser.mockReturnValue({ sub: OWNER_SUB });

    const result = await roles.update({
      pathParameters: { name: 'estimator' },
      body: JSON.stringify({
        permissions: ['estimates.create', 'estimates.edit', 'estimates.view', 'team.roles']
      })
    });

    expect(result.statusCode).toBe(200);
  });

  test('7. member with updated estimator role can now create roles', async () => {
    auth.getUser.mockReturnValue({ sub: MEMBER_SUB });

    const result = await roles.create({
      body: JSON.stringify({
        name: 'viewer',
        permissions: ['estimates.view']
      })
    });

    expect(result.statusCode).toBe(201);
  });

  // --- Cannot assign/edit owner role ---

  test('8. cannot assign owner role to anyone', async () => {
    auth.getUser.mockReturnValue({ sub: OWNER_SUB });

    const result = await roles.assign({
      body: JSON.stringify({
        email: 'member@roles.com',
        role: 'owner'
      })
    });

    expect(result.statusCode).toBe(400);
  });

  test('9. cannot edit the owner role', async () => {
    auth.getUser.mockReturnValue({ sub: OWNER_SUB });

    const result = await roles.update({
      pathParameters: { name: 'owner' },
      body: JSON.stringify({ permissions: [] })
    });

    expect(result.statusCode).toBe(400);
  });

  test('10. cannot change the owner user role', async () => {
    auth.getUser.mockReturnValue({ sub: OWNER_SUB });

    const result = await roles.assign({
      body: JSON.stringify({
        email: 'owner@roles.com',
        role: 'member'
      })
    });

    expect(result.statusCode).toBe(400);
  });

  // --- Delete role resets members ---

  test('11. deleting estimator role resets member to "member" role', async () => {
    auth.getUser.mockReturnValue({ sub: OWNER_SUB });

    const result = await roles.remove({
      pathParameters: { name: 'estimator' }
    });

    expect(result.statusCode).toBe(200);

    // Verify the member was reset to 'member' role
    const userRecord = mockDB.items.find(
      i => i.PK === `COMPANY#${COMPANY_ID}` && i.SK === `USER#${MEMBER_SUB}`
    );
    expect(userRecord.role).toBe('member');
  });

  test('12. deleted role no longer appears in list', async () => {
    auth.getUser.mockReturnValue({ sub: OWNER_SUB });

    const result = await roles.list({});
    const body = JSON.parse(result.body);

    const estimator = body.roles.find(r => r.name === 'estimator');
    expect(estimator).toBeUndefined();
  });

  // --- Cannot delete built-in roles ---

  test('13. cannot delete owner role', async () => {
    auth.getUser.mockReturnValue({ sub: OWNER_SUB });

    const result = await roles.remove({
      pathParameters: { name: 'owner' }
    });
    expect(result.statusCode).toBe(400);
  });

  test('14. cannot delete member role', async () => {
    auth.getUser.mockReturnValue({ sub: OWNER_SUB });

    const result = await roles.remove({
      pathParameters: { name: 'member' }
    });
    expect(result.statusCode).toBe(400);
  });
});
