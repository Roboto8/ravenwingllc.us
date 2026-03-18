/**
 * Integration Test: Team Invite → Validate → Join
 *
 * Tests the full flow of inviting a team member, validating the invite,
 * and verifying team state throughout.
 */
const { MockDB } = require('../helpers/mock-db');
const mockDB = new MockDB();

jest.mock('../../handlers/lib/dynamo', () => mockDB);
jest.mock('../../handlers/lib/auth', () => ({
  getUser: jest.fn(),
  getCompanyId: jest.fn()
}));

const auth = require('../../handlers/lib/auth');
const team = require('../../handlers/team');
const company = require('../../handlers/company');

describe('Integration: Team Invite → Join Flow', () => {
  const COMPANY_ID = 'comp-team-integ';
  const OWNER_SUB = 'user-owner-sub';

  beforeAll(() => {
    mockDB.seed([
      {
        PK: `COMPANY#${COMPANY_ID}`,
        SK: 'PROFILE',
        name: 'Team Test Co',
        email: 'owner@teamtest.com',
        phone: '555-0001',
        subscriptionStatus: 'active',
        trialEndsAt: '2027-01-01T00:00:00.000Z'
      },
      {
        PK: `COMPANY#${COMPANY_ID}`,
        SK: `USER#${OWNER_SUB}`,
        GSI1PK: `USER#${OWNER_SUB}`,
        GSI1SK: `COMPANY#${COMPANY_ID}`,
        email: 'owner@teamtest.com',
        name: 'Owner',
        role: 'owner',
        createdAt: '2026-01-01T00:00:00.000Z'
      }
    ]);
  });

  beforeEach(() => {
    auth.getCompanyId.mockResolvedValue(COMPANY_ID);
    auth.getUser.mockReturnValue({ sub: OWNER_SUB, email: 'owner@teamtest.com' });
  });

  let inviteToken;

  // Step 1: List team - only owner
  test('1. team list shows only the owner', async () => {
    const result = await team.list({});
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.members).toHaveLength(1);
    expect(body.members[0].email).toBe('owner@teamtest.com');
    expect(body.members[0].role).toBe('owner');
    expect(body.invites).toHaveLength(0);
  });

  // Step 2: Invite a new member
  test('2. invite a new team member', async () => {
    const result = await team.invite({
      body: JSON.stringify({ email: 'newguy@teamtest.com' })
    });

    expect(result.statusCode).toBe(201);
    const body = JSON.parse(result.body);
    expect(body.email).toBe('newguy@teamtest.com');
    expect(body.token).toBeDefined();
    inviteToken = body.token;
  });

  // Step 3: Team list shows pending invite
  test('3. team list shows pending invite', async () => {
    const result = await team.list({});
    const body = JSON.parse(result.body);

    expect(body.members).toHaveLength(1); // still just owner
    expect(body.invites).toHaveLength(1);
    expect(body.invites[0].email).toBe('newguy@teamtest.com');
    expect(body.invites[0].token).toBe(inviteToken);
  });

  // Step 4: Validate invite (public endpoint)
  test('4. validate invite returns company info', async () => {
    const result = await team.validate({
      pathParameters: { token: inviteToken }
    });

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.valid).toBe(true);
    expect(body.companyName).toBe('Team Test Co');
    expect(body.email).toBe('newguy@teamtest.com');
  });

  // Step 5: Can't invite same email twice
  test('5. duplicate invite for existing member is rejected', async () => {
    const result = await team.invite({
      body: JSON.stringify({ email: 'owner@teamtest.com' })
    });

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toContain('Already a team member');
  });

  // Step 6: Invite a second member
  let invite2Token;
  test('6. invite a second team member', async () => {
    const result = await team.invite({
      body: JSON.stringify({ email: 'second@teamtest.com' })
    });

    expect(result.statusCode).toBe(201);
    invite2Token = JSON.parse(result.body).token;
  });

  // Step 7: Team list shows both invites
  test('7. team list shows two pending invites', async () => {
    const result = await team.list({});
    const body = JSON.parse(result.body);

    expect(body.invites).toHaveLength(2);
    const emails = body.invites.map(i => i.email);
    expect(emails).toContain('newguy@teamtest.com');
    expect(emails).toContain('second@teamtest.com');
  });

  // Step 8: Revoke second invite
  test('8. revoke second invite', async () => {
    const result = await team.revoke({
      pathParameters: { token: invite2Token }
    });

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).revoked).toBe(true);
  });

  // Step 9: Only first invite remains
  test('9. only first invite remains after revoke', async () => {
    const result = await team.list({});
    const body = JSON.parse(result.body);

    // The revoked invite is fully deleted, not just status changed
    expect(body.invites).toHaveLength(1);
    expect(body.invites[0].email).toBe('newguy@teamtest.com');
  });

  // Step 10: Simulate user joining (manually create user record as auth.postConfirmation would)
  test('10. simulate new user joining via invite', async () => {
    const NEW_SUB = 'user-newguy-sub';

    // auth.postConfirmation would create the user record
    await mockDB.put({
      PK: `COMPANY#${COMPANY_ID}`,
      SK: `USER#${NEW_SUB}`,
      GSI1PK: `USER#${NEW_SUB}`,
      GSI1SK: `COMPANY#${COMPANY_ID}`,
      email: 'newguy@teamtest.com',
      name: 'New Guy',
      role: 'member',
      createdAt: new Date().toISOString()
    });

    // Mark invite as accepted
    const invites = await mockDB.queryGSI(`INVITE#${inviteToken}`);
    if (invites.length > 0) {
      await mockDB.update(invites[0].PK, invites[0].SK, {
        status: 'accepted',
        acceptedAt: new Date().toISOString()
      });
    }
  });

  // Step 11: Team list shows new member
  test('11. team list shows new member after join', async () => {
    const result = await team.list({});
    const body = JSON.parse(result.body);

    expect(body.members).toHaveLength(2);
    const emails = body.members.map(m => m.email);
    expect(emails).toContain('owner@teamtest.com');
    expect(emails).toContain('newguy@teamtest.com');

    const newMember = body.members.find(m => m.email === 'newguy@teamtest.com');
    expect(newMember.role).toBe('member');
  });

  // Step 12: Accepted invite no longer shows as pending
  test('12. accepted invite not listed as pending', async () => {
    const result = await team.list({});
    const body = JSON.parse(result.body);

    // Only pending invites are shown
    expect(body.invites).toHaveLength(0);
  });

  // Step 13: Remove the new member
  test('13. owner removes the new member', async () => {
    const result = await team.remove({
      pathParameters: { email: 'newguy@teamtest.com' }
    });

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).removed).toBe(true);
  });

  // Step 14: Team is back to just owner
  test('14. team list shows only owner after removal', async () => {
    const result = await team.list({});
    const body = JSON.parse(result.body);

    expect(body.members).toHaveLength(1);
    expect(body.members[0].email).toBe('owner@teamtest.com');
  });

  // Step 15: Company profile is accessible throughout
  test('15. company profile is unaffected by team changes', async () => {
    const result = await company.get({});
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.name).toBe('Team Test Co');
    expect(body.id).toBe(COMPANY_ID);
  });
});
