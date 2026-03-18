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

describe('email-forwarder handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const makeEvent = (overrides = {}) => ({
    Records: [{
      ses: {
        mail: {
          messageId: 'msg-001',
          commonHeaders: {
            from: ['sender@example.com'],
            to: ['info@fencetrace.com'],
            subject: 'Hello there',
            ...overrides.commonHeaders
          },
          ...overrides.mail
        }
      }
    }]
  });

  const rawEmailContent = [
    'From: sender@example.com',
    'To: info@fencetrace.com',
    'Subject: Hello there',
    '',
    'Body of the email'
  ].join('\r\n');

  test('forwards email successfully', async () => {
    mockS3Send.mockResolvedValue({
      Body: { transformToString: () => Promise.resolve(rawEmailContent) }
    });
    mockSesSend.mockResolvedValue({});

    await handler(makeEvent());

    expect(mockS3Send).toHaveBeenCalledTimes(1);
    const s3Arg = mockS3Send.mock.calls[0][0];
    expect(s3Arg.Bucket).toBe('fencetrace-email-us-east-1');
    expect(s3Arg.Key).toBe('incoming/msg-001');

    expect(mockSesSend).toHaveBeenCalledTimes(1);
    const sesArg = mockSesSend.mock.calls[0][0];
    expect(sesArg.Source).toBe('info@fencetrace.com');
    expect(sesArg.Destinations).toEqual(['portertoddc@gmail.com']);
  });

  test('rewrites From, To, and Subject headers', async () => {
    mockS3Send.mockResolvedValue({
      Body: { transformToString: () => Promise.resolve(rawEmailContent) }
    });
    mockSesSend.mockResolvedValue({});

    await handler(makeEvent());

    const sesArg = mockSesSend.mock.calls[0][0];
    const emailData = sesArg.RawMessage.Data.toString();

    // From should be rewritten to the 'to' address
    expect(emailData).toContain('From: "FenceTrace Fwd <info@fencetrace.com>"');
    expect(emailData).toContain('Reply-To: sender@example.com');
    // To should be rewritten to the forward address
    expect(emailData).toContain('To: portertoddc@gmail.com');
    // Subject should be prefixed with Fwd:
    expect(emailData).toContain('Subject: Fwd: Hello there [via info@fencetrace.com]');
  });

  test('does not double-prefix subject that already starts with Fwd:', async () => {
    const fwdEmail = rawEmailContent.replace('Subject: Hello there', 'Subject: Fwd: Already forwarded');
    mockS3Send.mockResolvedValue({
      Body: { transformToString: () => Promise.resolve(fwdEmail) }
    });
    mockSesSend.mockResolvedValue({});

    await handler(makeEvent({
      commonHeaders: { subject: 'Fwd: Already forwarded' }
    }));

    const sesArg = mockSesSend.mock.calls[0][0];
    const emailData = sesArg.RawMessage.Data.toString();

    // Should NOT add another Fwd: prefix
    expect(emailData).not.toContain('Subject: Fwd: Fwd:');
    expect(emailData).toContain('Subject: Fwd: Already forwarded');
  });

  test('handles missing subject gracefully', async () => {
    const noSubjectEmail = [
      'From: sender@example.com',
      'To: info@fencetrace.com',
      'Subject: (no subject)',
      '',
      'Body'
    ].join('\r\n');

    mockS3Send.mockResolvedValue({
      Body: { transformToString: () => Promise.resolve(noSubjectEmail) }
    });
    mockSesSend.mockResolvedValue({});

    await handler(makeEvent({
      commonHeaders: { subject: undefined }
    }));

    const sesArg = mockSesSend.mock.calls[0][0];
    const emailData = sesArg.RawMessage.Data.toString();
    expect(emailData).toContain('Fwd: (no subject)');
  });

  test('continues processing when S3 fetch fails', async () => {
    mockS3Send.mockRejectedValue(new Error('S3 access denied'));

    // Should not throw
    await handler(makeEvent());

    expect(mockS3Send).toHaveBeenCalledTimes(1);
    expect(mockSesSend).not.toHaveBeenCalled();
  });

  test('continues processing when SES send fails', async () => {
    mockS3Send.mockResolvedValue({
      Body: { transformToString: () => Promise.resolve(rawEmailContent) }
    });
    mockSesSend.mockRejectedValue(new Error('SES throttled'));

    // Should not throw
    await handler(makeEvent());

    expect(mockSesSend).toHaveBeenCalledTimes(1);
  });

  test('processes multiple records', async () => {
    mockS3Send.mockResolvedValue({
      Body: { transformToString: () => Promise.resolve(rawEmailContent) }
    });
    mockSesSend.mockResolvedValue({});

    const event = {
      Records: [
        {
          ses: {
            mail: {
              messageId: 'msg-001',
              commonHeaders: {
                from: ['a@example.com'],
                to: ['info@fencetrace.com'],
                subject: 'First'
              }
            }
          }
        },
        {
          ses: {
            mail: {
              messageId: 'msg-002',
              commonHeaders: {
                from: ['b@example.com'],
                to: ['support@fencetrace.com'],
                subject: 'Second'
              }
            }
          }
        }
      ]
    };

    await handler(event);

    expect(mockS3Send).toHaveBeenCalledTimes(2);
    expect(mockSesSend).toHaveBeenCalledTimes(2);
  });

  test('handles missing from gracefully', async () => {
    mockS3Send.mockResolvedValue({
      Body: { transformToString: () => Promise.resolve(rawEmailContent) }
    });
    mockSesSend.mockResolvedValue({});

    const event = makeEvent({
      commonHeaders: { from: [], to: ['info@fencetrace.com'], subject: 'Test' }
    });
    // from[0] will be undefined, falls back to 'unknown'
    await handler(event);

    expect(mockSesSend).toHaveBeenCalledTimes(1);
  });
});
