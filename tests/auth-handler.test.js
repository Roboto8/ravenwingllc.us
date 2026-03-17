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

  test('calls db.put twice (company + user)', async () => {
    const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
    const send = DynamoDBDocumentClient.from().send;

    await postConfirmation(makeEvent());
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
    expect(firstCallArg.Item.subscriptionStatus).toBe('trialing');
    expect(firstCallArg.Item.trialEndsAt).toBeDefined();
    expect(firstCallArg.Item.createdAt).toBeDefined();
  });

  test('creates user record with correct fields', async () => {
    const { PutCommand } = require('@aws-sdk/lib-dynamodb');

    await postConfirmation(makeEvent());

    const secondCallArg = PutCommand.mock.calls[1][0];
    expect(secondCallArg.Item.SK).toMatch(/^USER#user-sub-123$/);
    expect(secondCallArg.Item.GSI1PK).toBe('USER#user-sub-123');
    expect(secondCallArg.Item.GSI1SK).toMatch(/^COMPANY#/);
    expect(secondCallArg.Item.email).toBe('test@example.com');
    expect(secondCallArg.Item.role).toBe('owner');
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

    const companyPK = PutCommand.mock.calls[0][0].Item.PK;
    const userPK = PutCommand.mock.calls[1][0].Item.PK;
    const userGSI1SK = PutCommand.mock.calls[1][0].Item.GSI1SK;

    expect(companyPK).toBe(userPK);
    expect(companyPK).toBe(userGSI1SK);
  });
});
