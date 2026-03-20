/**
 * Edge case tests for email-forwarder handler — CRLF injection,
 * header sanitization, and unusual input scenarios.
 */
const mockS3Send = jest.fn();
const mockSesSend = jest.fn();

jest.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client: jest.fn().mockImplementation(() => ({ send: mockS3Send })),
    GetObjectCommand: jest.fn().mockImplementation((params) => params)
  };
});

jest.mock('@aws-sdk/client-ses', () => {
  return {
    SESClient: jest.fn().mockImplementation(() => ({ send: mockSesSend })),
    SendRawEmailCommand: jest.fn().mockImplementation((params) => params)
  };
}, { virtual: true });

const { handler } = require('../handlers/email-forwarder');

describe('email-forwarder - edge cases', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const makeEvent = (overrides = {}) => ({
    Records: [{
      ses: {
        mail: {
          messageId: overrides.messageId || 'msg-001',
          commonHeaders: {
            from: ['sender@example.com'],
            to: ['info@fencetrace.com'],
            subject: 'Test subject',
            ...overrides.commonHeaders
          }
        }
      }
    }]
  });

  const rawEmail = [
    'From: sender@example.com',
    'To: info@fencetrace.com',
    'Subject: Test subject',
    '',
    'Body of the email'
  ].join('\r\n');

  // ===== CRLF injection prevention =====
  describe('CRLF injection sanitization', () => {
    test('strips \\r\\n from From header — injected Bcc stays inline, not a separate header', async () => {
      mockS3Send.mockResolvedValue({
        Body: { transformToString: () => Promise.resolve(rawEmail) }
      });
      mockSesSend.mockResolvedValue({});

      await handler(makeEvent({
        commonHeaders: {
          from: ['attacker@evil.com\r\nBcc: victim@example.com'],
          to: ['info@fencetrace.com'],
          subject: 'Test'
        }
      }));

      const sesArg = mockSesSend.mock.calls[0][0];
      const emailData = sesArg.RawMessage.Data.toString();
      // The \r\n is stripped, so "Bcc:" is concatenated into the Reply-To value
      // — NOT on its own line as a real header
      expect(emailData).toContain('Reply-To: attacker@evil.comBcc: victim@example.com');
      // Verify it's NOT a standalone Bcc header (no newline before it)
      expect(emailData).not.toMatch(/\r\nBcc:/);
    });

    test('strips \\r\\n from Subject header — injected content stays inline', async () => {
      mockS3Send.mockResolvedValue({
        Body: { transformToString: () => Promise.resolve(rawEmail) }
      });
      mockSesSend.mockResolvedValue({});

      await handler(makeEvent({
        commonHeaders: {
          from: ['sender@example.com'],
          to: ['info@fencetrace.com'],
          subject: 'Legit\r\nBcc: injected@evil.com'
        }
      }));

      const sesArg = mockSesSend.mock.calls[0][0];
      const emailData = sesArg.RawMessage.Data.toString();
      // Newlines stripped: "Bcc: injected..." is part of the subject, not a header
      expect(emailData).toContain('Fwd: LegitBcc: injected@evil.com');
      // NOT a standalone Bcc header
      expect(emailData).not.toMatch(/\r\nBcc:/);
    });

    test('strips \\r\\n from To header', async () => {
      mockS3Send.mockResolvedValue({
        Body: { transformToString: () => Promise.resolve(rawEmail) }
      });
      mockSesSend.mockResolvedValue({});

      await handler(makeEvent({
        commonHeaders: {
          from: ['sender@example.com'],
          to: ['info@fencetrace.com\r\nBcc: injected@evil.com'],
          subject: 'Test'
        }
      }));

      const sesArg = mockSesSend.mock.calls[0][0];
      const emailData = sesArg.RawMessage.Data.toString();
      // The To rewrite should use sanitized value
      expect(emailData).toContain('To: portertoddc@gmail.com');
    });
  });

  // ===== Graceful handling of missing/undefined values =====
  describe('missing header values', () => {
    test('handles undefined to array', async () => {
      mockS3Send.mockResolvedValue({
        Body: { transformToString: () => Promise.resolve(rawEmail) }
      });
      mockSesSend.mockResolvedValue({});

      const event = {
        Records: [{
          ses: {
            mail: {
              messageId: 'msg-noTo',
              commonHeaders: {
                from: ['sender@example.com'],
                to: undefined,
                subject: 'Test'
              }
            }
          }
        }]
      };

      // to is undefined, so to || [] gives []; to[0] is undefined
      // Source will be undefined - SES may reject but handler shouldn't throw
      await expect(handler(event)).resolves.not.toThrow();
    });

    test('handles empty to array', async () => {
      mockS3Send.mockResolvedValue({
        Body: { transformToString: () => Promise.resolve(rawEmail) }
      });
      mockSesSend.mockResolvedValue({});

      await handler(makeEvent({
        commonHeaders: { from: ['sender@example.com'], to: [], subject: 'Test' }
      }));

      // Should still call SES (source will be undefined but handler doesn't guard that)
      expect(mockSesSend).toHaveBeenCalledTimes(1);
    });
  });

  // ===== S3 key construction =====
  describe('S3 key construction', () => {
    test('uses incoming/ prefix with messageId', async () => {
      mockS3Send.mockResolvedValue({
        Body: { transformToString: () => Promise.resolve(rawEmail) }
      });
      mockSesSend.mockResolvedValue({});

      await handler(makeEvent({ messageId: 'msg-unique-id-123' }));

      const s3Arg = mockS3Send.mock.calls[0][0];
      expect(s3Arg.Key).toBe('incoming/msg-unique-id-123');
    });
  });

  // ===== One record fails, next succeeds =====
  describe('partial failure in batch', () => {
    test('continues to next record after S3 failure', async () => {
      mockS3Send
        .mockRejectedValueOnce(new Error('S3 error'))
        .mockResolvedValueOnce({
          Body: { transformToString: () => Promise.resolve(rawEmail) }
        });
      mockSesSend.mockResolvedValue({});

      const event = {
        Records: [
          {
            ses: {
              mail: {
                messageId: 'msg-fail',
                commonHeaders: { from: ['a@x.com'], to: ['info@fencetrace.com'], subject: 'Fail' }
              }
            }
          },
          {
            ses: {
              mail: {
                messageId: 'msg-ok',
                commonHeaders: { from: ['b@x.com'], to: ['info@fencetrace.com'], subject: 'Ok' }
              }
            }
          }
        ]
      };

      await handler(event);

      expect(mockS3Send).toHaveBeenCalledTimes(2);
      expect(mockSesSend).toHaveBeenCalledTimes(1); // only second record
    });
  });

  // ===== Subject edge cases =====
  describe('subject edge cases', () => {
    test('handles subject with special regex characters', async () => {
      const specialEmail = rawEmail.replace('Subject: Test subject', 'Subject: Price is $100 (50% off)');
      mockS3Send.mockResolvedValue({
        Body: { transformToString: () => Promise.resolve(specialEmail) }
      });
      mockSesSend.mockResolvedValue({});

      await handler(makeEvent({
        commonHeaders: {
          from: ['sender@example.com'],
          to: ['info@fencetrace.com'],
          subject: 'Price is $100 (50% off)'
        }
      }));

      const sesArg = mockSesSend.mock.calls[0][0];
      const emailData = sesArg.RawMessage.Data.toString();
      expect(emailData).toContain('Fwd: Price is $100 (50% off)');
    });

    test('handles empty string subject', async () => {
      const emptySubjEmail = rawEmail.replace('Subject: Test subject', 'Subject: ');
      mockS3Send.mockResolvedValue({
        Body: { transformToString: () => Promise.resolve(emptySubjEmail) }
      });
      mockSesSend.mockResolvedValue({});

      await handler(makeEvent({
        commonHeaders: {
          from: ['sender@example.com'],
          to: ['info@fencetrace.com'],
          subject: ''
        }
      }));

      // Empty subject treated as falsy, falls back to '(no subject)'
      expect(mockSesSend).toHaveBeenCalledTimes(1);
    });
  });
});
