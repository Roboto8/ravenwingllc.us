// Mock AWS SDK before requiring the handler
jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({}))
}));

jest.mock('@aws-sdk/lib-dynamodb', () => {
  const mockSend = jest.fn().mockResolvedValue({});
  return {
    DynamoDBDocumentClient: {
      from: jest.fn().mockReturnValue({ send: mockSend })
    },
    GetCommand: jest.fn(),
    PutCommand: jest.fn().mockImplementation((params) => ({ input: params })),
    UpdateCommand: jest.fn(),
    DeleteCommand: jest.fn(),
    QueryCommand: jest.fn()
  };
});

const { PutCommand } = require('@aws-sdk/lib-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');

// Get a reference to the mock send function
const mockSend = DynamoDBDocumentClient.from().send;

const crypto = require('crypto');

describe('auth handler - postConfirmation', () => {
  let postConfirmation;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSend.mockResolvedValue({});
    // Re-require to get fresh module
    jest.resetModules();

    // Re-mock after reset
    jest.mock('@aws-sdk/client-dynamodb', () => ({
      DynamoDBClient: jest.fn().mockImplementation(() => ({}))
    }));
    jest.mock('@aws-sdk/lib-dynamodb', () => {
      const send = jest.fn().mockResolvedValue({});
      return {
        DynamoDBDocumentClient: { from: jest.fn().mockReturnValue({ send }) },
        GetCommand: jest.fn(),
        PutCommand: jest.fn().mockImplementation((params) => ({ input: params })),
        UpdateCommand: jest.fn(),
        DeleteCommand: jest.fn(),
        QueryCommand: jest.fn()
      };
    });

    postConfirmation = require('../handlers/auth').postConfirmation;
  });

  const makeEvent = (overrides = {}) => ({
    request: {
      userAttributes: {
        sub: 'user-sub-123',
        email: 'test@example.com',
        'custom:companyName': 'Test Corp',
        ...overrides
      }
    }
  });

  test('returns the event object', async () => {
    const event = makeEvent();
    const result = await postConfirmation(event);
    expect(result).toBe(event);
  });

  test('calls db operations for company + user', async () => {
    const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
    const send = DynamoDBDocumentClient.from().send;

    await postConfirmation(makeEvent());
    // put (company) + put (user) = 2
    expect(send).toHaveBeenCalledTimes(2);
  });

  test('creates company record with correct fields', async () => {
    const { PutCommand, DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
    const send = DynamoDBDocumentClient.from().send;

    await postConfirmation(makeEvent());

    // First call is company creation
    const firstCallArg = PutCommand.mock.calls[0][0];
    expect(firstCallArg.Item.SK).toBe('PROFILE');
    expect(firstCallArg.Item.PK).toMatch(/^COMPANY#/);
    expect(firstCallArg.Item.name).toBe('Test Corp');
    expect(firstCallArg.Item.email).toBe('test@example.com');
    expect(firstCallArg.Item.subscriptionStatus).toBe('free');
    expect(firstCallArg.Item.tier).toBe('free');
    expect(firstCallArg.Item.createdAt).toBeDefined();
  });

  test('creates user record with correct fields', async () => {
    const { PutCommand } = require('@aws-sdk/lib-dynamodb');

    await postConfirmation(makeEvent());

    // PutCommand calls: [0] company, [1] user
    const userCallArg = PutCommand.mock.calls[1][0];
    expect(userCallArg.Item.SK).toMatch(/^USER#user-sub-123$/);
    expect(userCallArg.Item.GSI1PK).toBe('USER#user-sub-123');
    expect(userCallArg.Item.GSI1SK).toMatch(/^COMPANY#/);
    expect(userCallArg.Item.email).toBe('test@example.com');
    expect(userCallArg.Item.role).toBe('owner');
  });

  test('uses default company name when not provided', async () => {
    const { PutCommand } = require('@aws-sdk/lib-dynamodb');

    await postConfirmation(makeEvent({ 'custom:companyName': undefined }));

    const firstCallArg = PutCommand.mock.calls[0][0];
    expect(firstCallArg.Item.name).toBe('My Company');
  });

  test('free tier has no trial dates', async () => {
    const { PutCommand } = require('@aws-sdk/lib-dynamodb');

    await postConfirmation(makeEvent());

    const firstCallArg = PutCommand.mock.calls[0][0];
    expect(firstCallArg.Item.trialEndsAt).toBeUndefined();
    expect(firstCallArg.Item.subscriptionStatus).toBe('free');
    expect(firstCallArg.Item.tier).toBe('free');
  });

  test('company and user share the same companyId', async () => {
    const { PutCommand } = require('@aws-sdk/lib-dynamodb');

    await postConfirmation(makeEvent());

    // PutCommand calls: [0] company, [1] user
    const companyPK = PutCommand.mock.calls[0][0].Item.PK;
    const userPK = PutCommand.mock.calls[1][0].Item.PK;
    const userGSI1SK = PutCommand.mock.calls[1][0].Item.GSI1SK;

    expect(companyPK).toBe(userPK);
    expect(companyPK).toBe(userGSI1SK);
  });

  test('joins existing company when inviteToken is valid', async () => {
    const { PutCommand, UpdateCommand, QueryCommand, DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
    const send = DynamoDBDocumentClient.from().send;

    // Mock GSI query to return a pending invite (email must match signup email)
    send.mockResolvedValueOnce({ Items: [{
      PK: 'COMPANY#existing-comp',
      SK: 'INVITE#valid-token',
      GSI1PK: 'INVITE#valid-token',
      GSI1SK: 'COMPANY#existing-comp',
      email: 'test@example.com',
      status: 'pending'
    }]});
    // Mock the put (user creation) and update (mark invite used)
    send.mockResolvedValue({});

    const event = makeEvent({ 'custom:inviteToken': 'valid-token' });
    const result = await postConfirmation(event);

    expect(result).toBe(event);
    // Should have called: queryGSI, put (user), update (invite) = 3 calls
    expect(send).toHaveBeenCalledTimes(3);
    // User should be created as 'member' not 'owner'
    const putCall = PutCommand.mock.calls[0][0];
    expect(putCall.Item.role).toBe('member');
    expect(putCall.Item.PK).toBe('COMPANY#existing-comp');
  });

  test('rejects invite when signup email does not match invited email', async () => {
    const { PutCommand, DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
    const send = DynamoDBDocumentClient.from().send;

    // Mock GSI query returns a pending invite for a different email
    send.mockResolvedValueOnce({ Items: [{
      PK: 'COMPANY#existing-comp',
      SK: 'INVITE#valid-token',
      GSI1PK: 'INVITE#valid-token',
      GSI1SK: 'COMPANY#existing-comp',
      email: 'someone-else@test.com',
      status: 'pending'
    }]});
    // Falls through to new company creation: put company + put user
    send.mockResolvedValue({});

    const event = makeEvent({ 'custom:inviteToken': 'valid-token' });
    const result = await postConfirmation(event);

    expect(result).toBe(event);
    // queryGSI (1) + put company (1) + put user (1) = 3
    expect(send).toHaveBeenCalledTimes(3);
    const firstPut = PutCommand.mock.calls[0][0];
    expect(firstPut.Item.SK).toBe('PROFILE'); // new company, not member join
    expect(firstPut.Item.PK).not.toBe('COMPANY#existing-comp');
  });

  test('creates new company when inviteToken is invalid', async () => {
    const { PutCommand, QueryCommand, DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
    const send = DynamoDBDocumentClient.from().send;

    // Mock GSI query returns empty (invalid token)
    send.mockResolvedValueOnce({ Items: [] });
    // Mock puts for company + user
    send.mockResolvedValue({});

    const event = makeEvent({ 'custom:inviteToken': 'bad-token' });
    await postConfirmation(event);

    // Should create company + user = 2 puts after the failed GSI query
    expect(PutCommand).toHaveBeenCalledTimes(2);
    const firstPut = PutCommand.mock.calls[0][0];
    expect(firstPut.Item.SK).toBe('PROFILE'); // company record
  });

  test('new signup gets free tier (no trial records)', async () => {
    const { PutCommand } = require('@aws-sdk/lib-dynamodb');

    await postConfirmation(makeEvent());

    // PutCommand calls: [0] company, [1] user — no trial record
    expect(PutCommand).toHaveBeenCalledTimes(2);
    const companyPut = PutCommand.mock.calls[0][0];
    expect(companyPut.Item.subscriptionStatus).toBe('free');
    expect(companyPut.Item.tier).toBe('free');
  });
});

describe('normalizeEmail', () => {
  const { normalizeEmail } = require('../handlers/auth');

  test('lowercases email', () => {
    expect(normalizeEmail('User@Example.COM')).toBe('user@example.com');
  });

  test('strips +alias', () => {
    expect(normalizeEmail('user+test@example.com')).toBe('user@example.com');
  });

  test('strips dots for Gmail', () => {
    expect(normalizeEmail('u.s.e.r@gmail.com')).toBe('user@gmail.com');
  });

  test('strips dots for googlemail.com', () => {
    expect(normalizeEmail('u.s.e.r@googlemail.com')).toBe('user@googlemail.com');
  });

  test('keeps dots for non-Gmail providers', () => {
    expect(normalizeEmail('first.last@outlook.com')).toBe('first.last@outlook.com');
  });

  test('handles +alias AND dots for Gmail', () => {
    expect(normalizeEmail('f.i.r.s.t+promo@gmail.com')).toBe('first@gmail.com');
  });

  test('handles email without domain gracefully', () => {
    expect(normalizeEmail('nodomain')).toBe('nodomain');
  });
});
