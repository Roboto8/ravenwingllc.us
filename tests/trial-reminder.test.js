const mockSend = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(() => ({}))
}));

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: jest.fn(() => ({ send: mockSend })) },
  ScanCommand: jest.fn((params) => ({ _type: 'Scan', ...params })),
  UpdateCommand: jest.fn((params) => ({ _type: 'Update', ...params }))
}));

jest.mock('@aws-sdk/client-ses', () => ({
  SESClient: jest.fn(() => ({ send: mockSend })),
  SendEmailCommand: jest.fn((params) => ({ _type: 'SendEmail', ...params }))
}));

describe('trial-reminder handler', () => {
  let handler;
  const NOW = new Date('2026-03-18T12:00:00Z');

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    // Re-require to get fresh module with mocked deps
    jest.resetModules();
    // Re-setup mocks after resetModules
    jest.mock('@aws-sdk/client-dynamodb', () => ({
      DynamoDBClient: jest.fn(() => ({}))
    }));
    jest.mock('@aws-sdk/lib-dynamodb', () => ({
      DynamoDBDocumentClient: { from: jest.fn(() => ({ send: mockSend })) },
      ScanCommand: jest.fn((params) => ({ _type: 'Scan', ...params })),
      UpdateCommand: jest.fn((params) => ({ _type: 'Update', ...params }))
    }));
    jest.mock('@aws-sdk/client-ses', () => ({
      SESClient: jest.fn(() => ({ send: mockSend })),
      SendEmailCommand: jest.fn((params) => ({ _type: 'SendEmail', ...params }))
    }));
    handler = require('../handlers/trial-reminder').handler;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('sends email to trialing company within 3 days of expiry', async () => {
    const trialEnd = new Date(NOW.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString();
    mockSend
      .mockResolvedValueOnce({ Items: [
        { PK: 'COMPANY#c1', SK: 'PROFILE', email: 'test@example.com', name: 'Acme Fences', subscriptionStatus: 'trialing', trialEndsAt: trialEnd }
      ]})
      .mockResolvedValueOnce({}) // SES send
      .mockResolvedValueOnce({}); // DDB update

    const result = await handler();

    expect(result.sent).toBe(1);
    expect(result.skipped).toBe(0);
    expect(mockSend).toHaveBeenCalledTimes(3); // scan + ses + update
  });

  test('skips company that already has trialReminderSent', async () => {
    // The ScanCommand filter excludes items with trialReminderSent,
    // so they won't appear in results at all
    mockSend.mockResolvedValueOnce({ Items: [] });

    const result = await handler();

    expect(result.sent).toBe(0);
    expect(result.checked).toBe(0);
  });

  test('skips company with emailOptOut', async () => {
    const trialEnd = new Date(NOW.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString();
    mockSend.mockResolvedValueOnce({ Items: [
      { PK: 'COMPANY#c1', SK: 'PROFILE', email: 'test@example.com', subscriptionStatus: 'trialing', trialEndsAt: trialEnd, emailOptOut: true }
    ]});

    const result = await handler();

    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(1);
    // Should NOT have called SES
    expect(mockSend).toHaveBeenCalledTimes(1); // only the scan
  });

  test('skips expired trials', async () => {
    const trialEnd = new Date(NOW.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString();
    mockSend.mockResolvedValueOnce({ Items: [
      { PK: 'COMPANY#c1', SK: 'PROFILE', email: 'test@example.com', subscriptionStatus: 'trialing', trialEndsAt: trialEnd }
    ]});

    const result = await handler();

    expect(result.sent).toBe(0);
    expect(result.checked).toBe(0);
  });

  test('skips trials more than 3 days away', async () => {
    const trialEnd = new Date(NOW.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString();
    mockSend.mockResolvedValueOnce({ Items: [
      { PK: 'COMPANY#c1', SK: 'PROFILE', email: 'test@example.com', subscriptionStatus: 'trialing', trialEndsAt: trialEnd }
    ]});

    const result = await handler();

    expect(result.sent).toBe(0);
    expect(result.checked).toBe(0);
  });
});
