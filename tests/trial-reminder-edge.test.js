/**
 * Edge case tests for trial-reminder handler — missing fields,
 * SES failures, multiple companies, and CAN-SPAM compliance.
 */
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

describe('trial-reminder - edge cases', () => {
  let handler;
  const NOW = new Date('2026-03-18T12:00:00Z');

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    jest.resetModules();
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

  const trialEnd2Days = new Date(NOW.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString();

  function makeCompany(overrides = {}) {
    return {
      PK: 'COMPANY#c1',
      SK: 'PROFILE',
      email: 'test@example.com',
      name: 'Acme Fences',
      subscriptionStatus: 'trialing',
      trialEndsAt: trialEnd2Days,
      ...overrides
    };
  }

  // ===== Missing email =====
  describe('missing email', () => {
    test('skips company with no email address', async () => {
      mockSend.mockResolvedValueOnce({
        Items: [makeCompany({ email: undefined })]
      });

      const result = await handler();

      expect(result.sent).toBe(0);
      expect(result.checked).toBe(1); // filtered in, but skipped by !email check
      expect(mockSend).toHaveBeenCalledTimes(1); // only scan
    });

    test('skips company with empty string email', async () => {
      mockSend.mockResolvedValueOnce({
        Items: [makeCompany({ email: '' })]
      });

      const result = await handler();

      expect(result.sent).toBe(0);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });
  });

  // ===== Company name fallbacks =====
  describe('company name fallback', () => {
    test('uses companyName when name is missing', async () => {
      const { SendEmailCommand } = require('@aws-sdk/client-ses');
      mockSend
        .mockResolvedValueOnce({
          Items: [makeCompany({ name: undefined, companyName: 'My Fence Co' })]
        })
        .mockResolvedValueOnce({}) // SES
        .mockResolvedValueOnce({}); // DDB update

      await handler();

      expect(result = SendEmailCommand.mock.calls[0][0]).toBeDefined();
      const html = result.Message.Body.Html.Data;
      expect(html).toContain('Hi My Fence Co');
    });

    test('uses "there" when both name and companyName are missing', async () => {
      const { SendEmailCommand } = require('@aws-sdk/client-ses');
      mockSend
        .mockResolvedValueOnce({
          Items: [makeCompany({ name: undefined, companyName: undefined })]
        })
        .mockResolvedValueOnce({}) // SES
        .mockResolvedValueOnce({}); // DDB update

      await handler();

      const emailParams = SendEmailCommand.mock.calls[0][0];
      const html = emailParams.Message.Body.Html.Data;
      expect(html).toContain('Hi there');
    });
  });

  // ===== SES failure =====
  describe('SES send failure', () => {
    test('continues after SES failure and does not mark as reminded', async () => {
      mockSend
        .mockResolvedValueOnce({
          Items: [makeCompany()]
        })
        .mockRejectedValueOnce(new Error('SES throttled')); // SES fails

      const result = await handler();

      expect(result.sent).toBe(0);
      expect(result.checked).toBe(1);
      // Should not have called update (the 3rd call)
      expect(mockSend).toHaveBeenCalledTimes(2); // scan + failed SES
    });
  });

  // ===== Multiple companies =====
  describe('multiple companies', () => {
    test('processes multiple companies independently', async () => {
      mockSend
        .mockResolvedValueOnce({
          Items: [
            makeCompany({ PK: 'COMPANY#c1', email: 'a@test.com', name: 'Company A' }),
            makeCompany({ PK: 'COMPANY#c2', email: 'b@test.com', name: 'Company B' })
          ]
        })
        .mockResolvedValueOnce({}) // SES for c1
        .mockResolvedValueOnce({}) // DDB update for c1
        .mockResolvedValueOnce({}) // SES for c2
        .mockResolvedValueOnce({}); // DDB update for c2

      const result = await handler();

      expect(result.sent).toBe(2);
      expect(result.checked).toBe(2);
      expect(mockSend).toHaveBeenCalledTimes(5);
    });

    test('one failure does not block subsequent companies', async () => {
      mockSend
        .mockResolvedValueOnce({
          Items: [
            makeCompany({ PK: 'COMPANY#c1', email: 'fail@test.com' }),
            makeCompany({ PK: 'COMPANY#c2', email: 'ok@test.com' })
          ]
        })
        .mockRejectedValueOnce(new Error('SES error')) // c1 fails
        .mockResolvedValueOnce({}) // SES for c2
        .mockResolvedValueOnce({}); // DDB update for c2

      const result = await handler();

      expect(result.sent).toBe(1);
    });

    test('counts emailOptOut companies as skipped, not sent', async () => {
      mockSend
        .mockResolvedValueOnce({
          Items: [
            makeCompany({ PK: 'COMPANY#c1', email: 'a@test.com', emailOptOut: true }),
            makeCompany({ PK: 'COMPANY#c2', email: 'b@test.com' })
          ]
        })
        .mockResolvedValueOnce({}) // SES for c2
        .mockResolvedValueOnce({}); // DDB update for c2

      const result = await handler();

      expect(result.sent).toBe(1);
      expect(result.skipped).toBe(1);
    });
  });

  // ===== Trial end boundary =====
  describe('trial end boundary conditions', () => {
    test('includes trial ending exactly at 3 days', async () => {
      const exactlyThreeDays = new Date(NOW.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();
      mockSend
        .mockResolvedValueOnce({
          Items: [makeCompany({ trialEndsAt: exactlyThreeDays })]
        })
        .mockResolvedValueOnce({}) // SES
        .mockResolvedValueOnce({}); // DDB

      const result = await handler();
      expect(result.sent).toBe(1);
    });

    test('excludes trial ending at exactly now (already expired)', async () => {
      mockSend.mockResolvedValueOnce({
        Items: [makeCompany({ trialEndsAt: NOW.toISOString() })]
      });

      const result = await handler();
      expect(result.sent).toBe(0);
      expect(result.checked).toBe(0);
    });

    test('skips company with missing trialEndsAt', async () => {
      mockSend.mockResolvedValueOnce({
        Items: [makeCompany({ trialEndsAt: undefined })]
      });

      const result = await handler();
      expect(result.sent).toBe(0);
      expect(result.checked).toBe(0);
    });
  });

  // ===== DDB update marks company as reminded =====
  describe('reminder tracking', () => {
    test('sets trialReminderSent and timestamp after success', async () => {
      const { UpdateCommand } = require('@aws-sdk/lib-dynamodb');
      mockSend
        .mockResolvedValueOnce({ Items: [makeCompany()] })
        .mockResolvedValueOnce({}) // SES
        .mockResolvedValueOnce({}); // DDB update

      await handler();

      expect(UpdateCommand).toHaveBeenCalledTimes(1);
      const updateParams = UpdateCommand.mock.calls[0][0];
      expect(updateParams.UpdateExpression).toContain('trialReminderSent');
      expect(updateParams.ExpressionAttributeValues[':val']).toBe(true);
      expect(updateParams.ExpressionAttributeValues[':ts']).toBe(NOW.toISOString());
    });
  });

  // ===== Unsubscribe URL =====
  describe('unsubscribe URL', () => {
    test('email contains unsubscribe link with base64 company ID', async () => {
      const { SendEmailCommand } = require('@aws-sdk/client-ses');
      mockSend
        .mockResolvedValueOnce({ Items: [makeCompany({ PK: 'COMPANY#test-id-123' })] })
        .mockResolvedValueOnce({}) // SES
        .mockResolvedValueOnce({}); // DDB update

      await handler();

      const emailParams = SendEmailCommand.mock.calls[0][0];
      const html = emailParams.Message.Body.Html.Data;
      const text = emailParams.Message.Body.Text.Data;
      const expectedB64 = Buffer.from('test-id-123').toString('base64');

      expect(html).toContain('unsubscribe=' + expectedB64);
      expect(text).toContain('unsubscribe=' + expectedB64);
    });
  });

  // ===== Empty scan result =====
  describe('no companies to process', () => {
    test('handles null Items from scan', async () => {
      mockSend.mockResolvedValueOnce({ Items: null });

      const result = await handler();

      expect(result.sent).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.checked).toBe(0);
    });

    test('handles empty Items array', async () => {
      mockSend.mockResolvedValueOnce({ Items: [] });

      const result = await handler();

      expect(result.sent).toBe(0);
      expect(result.checked).toBe(0);
    });
  });

  // ===== CAN-SPAM compliance =====
  describe('CAN-SPAM compliance', () => {
    test('email contains physical address', async () => {
      const { SendEmailCommand } = require('@aws-sdk/client-ses');
      mockSend
        .mockResolvedValueOnce({ Items: [makeCompany()] })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});

      await handler();

      const emailParams = SendEmailCommand.mock.calls[0][0];
      const html = emailParams.Message.Body.Html.Data;
      const text = emailParams.Message.Body.Text.Data;

      expect(html).toContain('RavenWing LLC');
      expect(text).toContain('RavenWing LLC');
    });

    test('email has correct source and reply-to', async () => {
      const { SendEmailCommand } = require('@aws-sdk/client-ses');
      mockSend
        .mockResolvedValueOnce({ Items: [makeCompany()] })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});

      await handler();

      const emailParams = SendEmailCommand.mock.calls[0][0];
      expect(emailParams.Source).toContain('noreply@fencetrace.com');
      expect(emailParams.ReplyToAddresses).toEqual(['support@fencetrace.com']);
    });

    test('subject line is non-deceptive', async () => {
      const { SendEmailCommand } = require('@aws-sdk/client-ses');
      mockSend
        .mockResolvedValueOnce({ Items: [makeCompany()] })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});

      await handler();

      const emailParams = SendEmailCommand.mock.calls[0][0];
      expect(emailParams.Message.Subject.Data).toBe('Your FenceTrace trial ends in 3 days');
    });
  });
});
