/**
 * Tests for invite email case-insensitive matching in auth handler.
 */
describe('invite email case-insensitive matching', () => {
  let postConfirmation;
  let mockSendFn;

  beforeEach(() => {
    jest.resetModules();
    mockSendFn = jest.fn().mockResolvedValue({});
    const mockClient = { send: mockSendFn };
    jest.mock('@aws-sdk/client-dynamodb', () => ({
      DynamoDBClient: jest.fn().mockImplementation(() => ({}))
    }));
    jest.mock('@aws-sdk/lib-dynamodb', () => ({
      DynamoDBDocumentClient: { from: jest.fn().mockReturnValue(mockClient) },
      GetCommand: jest.fn().mockImplementation(p => p),
      PutCommand: jest.fn().mockImplementation(p => p),
      UpdateCommand: jest.fn().mockImplementation(p => p),
      DeleteCommand: jest.fn().mockImplementation(p => p),
      QueryCommand: jest.fn().mockImplementation(p => p)
    }));
    process.env.DYNAMODB_TABLE = 'test-table';
    postConfirmation = require('../handlers/auth').postConfirmation;
  });

  function makeEvent(email, inviteToken) {
    return {
      request: {
        userAttributes: {
          sub: 'user-sub-1',
          email,
          'custom:companyName': 'Test Co',
          'custom:inviteToken': inviteToken || ''
        }
      }
    };
  }

  test('accepts invite when emails match case-insensitively', async () => {
    const { PutCommand } = require('@aws-sdk/lib-dynamodb');

    mockSendFn.mockResolvedValueOnce({ Items: [{
      PK: 'COMPANY#comp-1', SK: 'INVITE#tok-1',
      GSI1PK: 'INVITE#tok-1', GSI1SK: 'COMPANY#comp-1',
      email: 'test@example.com', status: 'pending'
    }]});
    mockSendFn.mockResolvedValue({});

    await postConfirmation(makeEvent('Test@Example.COM', 'tok-1'));

    const putCall = PutCommand.mock.calls[0][0];
    expect(putCall.Item.role).toBe('member');
    expect(putCall.Item.PK).toBe('COMPANY#comp-1');
  });

  test('rejects invite when email does not match at all', async () => {
    const { PutCommand } = require('@aws-sdk/lib-dynamodb');

    mockSendFn.mockResolvedValueOnce({ Items: [{
      PK: 'COMPANY#comp-1', SK: 'INVITE#tok-1',
      GSI1PK: 'INVITE#tok-1', GSI1SK: 'COMPANY#comp-1',
      email: 'someone@other.com', status: 'pending'
    }]});
    mockSendFn.mockResolvedValue({});

    await postConfirmation(makeEvent('hacker@evil.com', 'tok-1'));

    const companyPut = PutCommand.mock.calls[0][0];
    expect(companyPut.Item.SK).toBe('PROFILE');
    expect(companyPut.Item.PK).not.toBe('COMPANY#comp-1');
  });

  test('accepts invite when invite.email is empty', async () => {
    const { PutCommand } = require('@aws-sdk/lib-dynamodb');

    mockSendFn.mockResolvedValueOnce({ Items: [{
      PK: 'COMPANY#comp-1', SK: 'INVITE#tok-1',
      GSI1PK: 'INVITE#tok-1', GSI1SK: 'COMPANY#comp-1',
      email: '', status: 'pending'
    }]});
    mockSendFn.mockResolvedValue({});

    await postConfirmation(makeEvent('anyone@anywhere.com', 'tok-1'));

    const putCall = PutCommand.mock.calls[0][0];
    expect(putCall.Item.role).toBe('member');
  });
});
