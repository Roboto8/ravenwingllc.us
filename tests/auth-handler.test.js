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

  test('calls db operations for trial check + company + trial record + user', async () => {
    const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
    const send = DynamoDBDocumentClient.from().send;

    await postConfirmation(makeEvent());
    // get (trial check) + put (company) + put (trial record) + put (user) = 4
    expect(send).toHaveBeenCalledTimes(4);
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
    expect(firstCallArg.Item.subscriptionStatus).toBe('trialing');
    expect(firstCallArg.Item.trialEndsAt).toBeDefined();
    expect(firstCallArg.Item.createdAt).toBeDefined();
  });

  test('creates user record with correct fields', async () => {
    const { PutCommand } = require('@aws-sdk/lib-dynamodb');

    await postConfirmation(makeEvent());

    // PutCommand calls: [0] company, [1] trial record, [2] user
    const userCallArg = PutCommand.mock.calls[2][0];
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

  test('trial ends 14 days from now', async () => {
    const { PutCommand } = require('@aws-sdk/lib-dynamodb');

    const before = Date.now();
    await postConfirmation(makeEvent());
    const after = Date.now();

    const firstCallArg = PutCommand.mock.calls[0][0];
    const trialEnds = new Date(firstCallArg.Item.trialEndsAt).getTime();
    const fourteenDays = 14 * 24 * 60 * 60 * 1000;

    expect(trialEnds).toBeGreaterThanOrEqual(before + fourteenDays - 1000);
    expect(trialEnds).toBeLessThanOrEqual(after + fourteenDays + 1000);
  });

  test('company and user share the same companyId', async () => {
    const { PutCommand } = require('@aws-sdk/lib-dynamodb');

    await postConfirmation(makeEvent());

    // PutCommand calls: [0] company, [1] trial record, [2] user
    const companyPK = PutCommand.mock.calls[0][0].Item.PK;
    const userPK = PutCommand.mock.calls[2][0].Item.PK;
    const userGSI1SK = PutCommand.mock.calls[2][0].Item.GSI1SK;

    expect(companyPK).toBe(userPK);
    expect(companyPK).toBe(userGSI1SK);
  });

  test('joins existing company when inviteToken is valid', async () => {
    const { PutCommand, UpdateCommand, QueryCommand, DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
    const send = DynamoDBDocumentClient.from().send;

    // Mock GSI query to return a pending invite
    send.mockResolvedValueOnce({ Items: [{
      PK: 'COMPANY#existing-comp',
      SK: 'INVITE#valid-token',
      GSI1PK: 'INVITE#valid-token',
      GSI1SK: 'COMPANY#existing-comp',
      email: 'invited@test.com',
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

  test('creates new company when inviteToken is invalid', async () => {
    const { PutCommand, QueryCommand, DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
    const send = DynamoDBDocumentClient.from().send;

    // Mock GSI query returns empty (invalid token)
    send.mockResolvedValueOnce({ Items: [] });
    // Mock puts for company + user
    send.mockResolvedValue({});

    const event = makeEvent({ 'custom:inviteToken': 'bad-token' });
    await postConfirmation(event);

    // Should create company + trial record + user = 3 puts after the failed GSI query + trial check
    expect(PutCommand).toHaveBeenCalledTimes(3);
    const firstPut = PutCommand.mock.calls[0][0];
    expect(firstPut.Item.SK).toBe('PROFILE'); // company record
  });

  test('blocks second trial for same normalized email', async () => {
    const { PutCommand, GetCommand, DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
    const send = DynamoDBDocumentClient.from().send;

    // Trial check returns existing record (trial already used)
    send.mockResolvedValueOnce({ Item: { PK: 'TRIAL', SK: 'test@example.com', companyId: 'old-comp' } });
    // Remaining calls succeed
    send.mockResolvedValue({});

    await postConfirmation(makeEvent());

    // Company should be created with expired status
    const companyPut = PutCommand.mock.calls[0][0];
    expect(companyPut.Item.subscriptionStatus).toBe('expired');
    expect(new Date(companyPut.Item.trialEndsAt).getTime()).toBe(0);
  });

  test('blocks trial for +alias email variants', async () => {
    const { PutCommand, DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
    const send = DynamoDBDocumentClient.from().send;

    // Trial check returns existing record (user+1@example.com normalizes to user@example.com)
    send.mockResolvedValueOnce({ Item: { PK: 'TRIAL', SK: 'user@example.com' } });
    send.mockResolvedValue({});

    await postConfirmation(makeEvent({ email: 'user+sneaky@example.com' }));

    const companyPut = PutCommand.mock.calls[0][0];
    expect(companyPut.Item.subscriptionStatus).toBe('expired');
  });

  test('writes trial record on first signup', async () => {
    const { PutCommand } = require('@aws-sdk/lib-dynamodb');

    await postConfirmation(makeEvent());

    // PutCommand calls: [0] company, [1] trial record, [2] user
    const trialPut = PutCommand.mock.calls[1][0];
    expect(trialPut.Item.PK).toBe('TRIAL');
    expect(trialPut.Item.SK).toBe('test@example.com');
    expect(trialPut.Item.email).toBe('test@example.com');
  });

  test('does not write trial record when trial already used', async () => {
    const { PutCommand, DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
    const send = DynamoDBDocumentClient.from().send;

    // Trial already used
    send.mockResolvedValueOnce({ Item: { PK: 'TRIAL', SK: 'test@example.com' } });
    send.mockResolvedValue({});

    await postConfirmation(makeEvent());

    // Only 2 puts: company + user (no trial record)
    expect(PutCommand).toHaveBeenCalledTimes(2);
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
