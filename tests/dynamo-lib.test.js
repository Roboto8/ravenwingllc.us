/**
 * Tests for the DynamoDB wrapper library (handlers/lib/dynamo.js)
 * Covers cursor pagination, malformed input handling, and query patterns.
 */
const mockSend = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({}))
}));

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: jest.fn().mockReturnValue({ send: mockSend })
  },
  GetCommand: jest.fn().mockImplementation(p => ({ _type: 'Get', input: p })),
  PutCommand: jest.fn().mockImplementation(p => ({ _type: 'Put', input: p })),
  UpdateCommand: jest.fn().mockImplementation(p => ({ _type: 'Update', input: p })),
  DeleteCommand: jest.fn().mockImplementation(p => ({ _type: 'Delete', input: p })),
  QueryCommand: jest.fn().mockImplementation(p => ({ _type: 'Query', input: p }))
}));

process.env.DYNAMODB_TABLE = 'test-table';

const db = require('../handlers/lib/dynamo');

describe('dynamo lib', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('get', () => {
    test('returns item when found', async () => {
      mockSend.mockResolvedValue({ Item: { PK: 'A', SK: 'B', name: 'test' } });
      const result = await db.get('A', 'B');
      expect(result).toEqual({ PK: 'A', SK: 'B', name: 'test' });
    });

    test('returns undefined when not found', async () => {
      mockSend.mockResolvedValue({});
      const result = await db.get('A', 'missing');
      expect(result).toBeUndefined();
    });
  });

  describe('put', () => {
    test('stores item and returns it', async () => {
      mockSend.mockResolvedValue({});
      const item = { PK: 'A', SK: 'B', data: 'test' };
      const result = await db.put(item);
      expect(result).toEqual(item);
    });
  });

  describe('update', () => {
    test('builds correct UpdateExpression for single field', async () => {
      mockSend.mockResolvedValue({ Attributes: { PK: 'A', SK: 'B', name: 'updated' } });
      const { UpdateCommand } = require('@aws-sdk/lib-dynamodb');

      await db.update('A', 'B', { name: 'updated' });

      const call = UpdateCommand.mock.calls[UpdateCommand.mock.calls.length - 1][0];
      expect(call.UpdateExpression).toBe('SET #k0 = :v0');
      expect(call.ExpressionAttributeNames['#k0']).toBe('name');
      expect(call.ExpressionAttributeValues[':v0']).toBe('updated');
      expect(call.ReturnValues).toBe('ALL_NEW');
    });

    test('builds correct expression for multiple fields', async () => {
      mockSend.mockResolvedValue({ Attributes: {} });
      const { UpdateCommand } = require('@aws-sdk/lib-dynamodb');

      await db.update('A', 'B', { name: 'test', status: 'active', count: 5 });

      const call = UpdateCommand.mock.calls[UpdateCommand.mock.calls.length - 1][0];
      expect(call.UpdateExpression).toContain('#k0 = :v0');
      expect(call.UpdateExpression).toContain('#k1 = :v1');
      expect(call.UpdateExpression).toContain('#k2 = :v2');
    });

    test('returns Attributes from response', async () => {
      mockSend.mockResolvedValue({ Attributes: { PK: 'A', SK: 'B', name: 'new' } });
      const result = await db.update('A', 'B', { name: 'new' });
      expect(result).toEqual({ PK: 'A', SK: 'B', name: 'new' });
    });
  });

  describe('remove', () => {
    test('calls DeleteCommand with correct keys', async () => {
      mockSend.mockResolvedValue({});
      const { DeleteCommand } = require('@aws-sdk/lib-dynamodb');

      await db.remove('PK1', 'SK1');

      const call = DeleteCommand.mock.calls[DeleteCommand.mock.calls.length - 1][0];
      expect(call.Key).toEqual({ PK: 'PK1', SK: 'SK1' });
    });
  });

  describe('query', () => {
    test('returns items and null nextKey when no pagination', async () => {
      mockSend.mockResolvedValue({
        Items: [{ PK: 'A', SK: 'EST#1' }, { PK: 'A', SK: 'EST#2' }],
        LastEvaluatedKey: undefined
      });

      const result = await db.query('A', 'EST#', 50);
      expect(result.items).toHaveLength(2);
      expect(result.nextKey).toBeNull();
    });

    test('returns empty items when none found', async () => {
      mockSend.mockResolvedValue({ Items: undefined });

      const result = await db.query('A', 'EST#', 50);
      expect(result.items).toEqual([]);
      expect(result.nextKey).toBeNull();
    });

    test('returns base64-encoded nextKey when paginated', async () => {
      mockSend.mockResolvedValue({
        Items: [{ PK: 'A', SK: 'EST#1' }],
        LastEvaluatedKey: { PK: 'A', SK: 'EST#1' }
      });

      const result = await db.query('A', 'EST#', 1);
      expect(result.nextKey).toBeDefined();

      // Verify it's valid base64 that decodes to the key
      const decoded = JSON.parse(Buffer.from(result.nextKey, 'base64').toString());
      expect(decoded).toEqual({ PK: 'A', SK: 'EST#1' });
    });

    test('passes decoded cursor as ExclusiveStartKey', async () => {
      mockSend.mockResolvedValue({ Items: [], LastEvaluatedKey: undefined });
      const { QueryCommand } = require('@aws-sdk/lib-dynamodb');

      const cursor = Buffer.from(JSON.stringify({ PK: 'A', SK: 'EST#5' })).toString('base64');
      await db.query('A', 'EST#', 50, cursor);

      const call = QueryCommand.mock.calls[QueryCommand.mock.calls.length - 1][0];
      expect(call.ExclusiveStartKey).toEqual({ PK: 'A', SK: 'EST#5' });
    });

    test('uses ScanIndexForward false (newest first)', async () => {
      mockSend.mockResolvedValue({ Items: [] });
      const { QueryCommand } = require('@aws-sdk/lib-dynamodb');

      await db.query('A', 'EST#', 10);

      const call = QueryCommand.mock.calls[QueryCommand.mock.calls.length - 1][0];
      expect(call.ScanIndexForward).toBe(false);
    });

    test('defaults limit to 50', async () => {
      mockSend.mockResolvedValue({ Items: [] });
      const { QueryCommand } = require('@aws-sdk/lib-dynamodb');

      await db.query('A', 'EST#');

      const call = QueryCommand.mock.calls[QueryCommand.mock.calls.length - 1][0];
      expect(call.Limit).toBe(50);
    });
  });

  describe('queryGSI', () => {
    test('queries GSI1 index', async () => {
      mockSend.mockResolvedValue({
        Items: [{ GSI1PK: 'USER#sub1', GSI1SK: 'COMPANY#comp1' }]
      });
      const { QueryCommand } = require('@aws-sdk/lib-dynamodb');

      const result = await db.queryGSI('USER#sub1');

      expect(result).toHaveLength(1);
      const call = QueryCommand.mock.calls[QueryCommand.mock.calls.length - 1][0];
      expect(call.IndexName).toBe('GSI1');
      expect(call.ExpressionAttributeValues[':pk']).toBe('USER#sub1');
    });

    test('returns empty array when no items', async () => {
      mockSend.mockResolvedValue({ Items: undefined });
      const result = await db.queryGSI('NONEXISTENT#key');
      expect(result).toEqual([]);
    });
  });
});
