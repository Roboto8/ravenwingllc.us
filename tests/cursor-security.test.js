/**
 * Tests for cursor PK validation — cross-tenant protection in pagination.
 */
const mockCursorSend = jest.fn().mockResolvedValue({ Items: [], LastEvaluatedKey: undefined });

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({}))
}));
jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: jest.fn().mockReturnValue({ send: mockCursorSend }) },
  GetCommand: jest.fn().mockImplementation(p => p),
  PutCommand: jest.fn().mockImplementation(p => p),
  UpdateCommand: jest.fn().mockImplementation(p => p),
  DeleteCommand: jest.fn().mockImplementation(p => p),
  QueryCommand: jest.fn().mockImplementation(p => p)
}));

process.env.DYNAMODB_TABLE = 'test-table';
const db = require('../handlers/lib/dynamo');

describe('dynamo cursor PK validation', () => {
  beforeEach(() => {
    mockCursorSend.mockClear();
    mockCursorSend.mockResolvedValue({ Items: [], LastEvaluatedKey: undefined });
  });

  test('rejects cursor with mismatched PK (cross-tenant attack)', async () => {
    const tampered = Buffer.from(JSON.stringify({
      PK: 'COMPANY#hacker-company',
      SK: 'EST#2025-01-01#est-1'
    })).toString('base64');

    await db.query('COMPANY#my-company', 'EST#', 50, tampered);

    const passedParams = mockCursorSend.mock.calls[0][0];
    expect(passedParams.ExclusiveStartKey).toBeUndefined();
  });

  test('accepts cursor with matching PK', async () => {
    const valid = Buffer.from(JSON.stringify({
      PK: 'COMPANY#my-company',
      SK: 'EST#2025-01-01#est-1'
    })).toString('base64');

    await db.query('COMPANY#my-company', 'EST#', 50, valid);

    const passedParams = mockCursorSend.mock.calls[0][0];
    expect(passedParams.ExclusiveStartKey).toEqual({
      PK: 'COMPANY#my-company',
      SK: 'EST#2025-01-01#est-1'
    });
  });

  test('rejects malformed base64 cursor', async () => {
    await db.query('COMPANY#comp-1', 'EST#', 50, '!!!not-base64!!!');
    expect(mockCursorSend.mock.calls[0][0].ExclusiveStartKey).toBeUndefined();
  });

  test('rejects invalid JSON in cursor', async () => {
    const badJson = Buffer.from('{broken json}').toString('base64');
    await db.query('COMPANY#comp-1', 'EST#', 50, badJson);
    expect(mockCursorSend.mock.calls[0][0].ExclusiveStartKey).toBeUndefined();
  });

  test('ignores null/undefined cursor', async () => {
    await db.query('COMPANY#comp-1', 'EST#', 50, null);
    expect(mockCursorSend.mock.calls[0][0].ExclusiveStartKey).toBeUndefined();
  });
});
