/**
 * Tests for dynamo.js findById and queryFiltered functions
 * These were previously uncovered (lines 73-111).
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

describe('dynamo lib - findById', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns item when found on first page', async () => {
    mockSend.mockResolvedValue({
      Items: [
        { id: 'est-1', title: 'Fence A' },
        { id: 'est-2', title: 'Fence B' }
      ],
      LastEvaluatedKey: undefined
    });

    const result = await db.findById('COMPANY#comp-1', 'EST#', 'est-2');
    expect(result).toEqual({ id: 'est-2', title: 'Fence B' });
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  test('returns item when found on second page', async () => {
    mockSend
      .mockResolvedValueOnce({
        Items: [{ id: 'est-1', title: 'Fence A' }],
        LastEvaluatedKey: { PK: 'COMPANY#comp-1', SK: 'EST#1' }
      })
      .mockResolvedValueOnce({
        Items: [{ id: 'est-3', title: 'Fence C' }],
        LastEvaluatedKey: undefined
      });

    const result = await db.findById('COMPANY#comp-1', 'EST#', 'est-3');
    expect(result).toEqual({ id: 'est-3', title: 'Fence C' });
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  test('returns null when item not found across all pages', async () => {
    mockSend
      .mockResolvedValueOnce({
        Items: [{ id: 'est-1' }],
        LastEvaluatedKey: { PK: 'COMPANY#comp-1', SK: 'EST#1' }
      })
      .mockResolvedValueOnce({
        Items: [{ id: 'est-2' }],
        LastEvaluatedKey: undefined
      });

    const result = await db.findById('COMPANY#comp-1', 'EST#', 'est-99');
    expect(result).toBeNull();
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  test('returns null when no items exist', async () => {
    mockSend.mockResolvedValue({ Items: undefined, LastEvaluatedKey: undefined });

    const result = await db.findById('COMPANY#comp-1', 'EST#', 'est-1');
    expect(result).toBeNull();
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  test('passes ExclusiveStartKey on subsequent pages', async () => {
    const { QueryCommand } = require('@aws-sdk/lib-dynamodb');
    const pageKey = { PK: 'COMPANY#comp-1', SK: 'EST#5' };

    mockSend
      .mockResolvedValueOnce({
        Items: [],
        LastEvaluatedKey: pageKey
      })
      .mockResolvedValueOnce({
        Items: [{ id: 'target' }],
        LastEvaluatedKey: undefined
      });

    await db.findById('COMPANY#comp-1', 'EST#', 'target');

    // Second call should have ExclusiveStartKey
    const secondCall = QueryCommand.mock.calls[1][0];
    expect(secondCall.ExclusiveStartKey).toEqual(pageKey);
  });

  test('uses Limit of 100 and ScanIndexForward false', async () => {
    const { QueryCommand } = require('@aws-sdk/lib-dynamodb');
    mockSend.mockResolvedValue({ Items: [], LastEvaluatedKey: undefined });

    await db.findById('COMPANY#comp-1', 'EST#', 'est-1');

    const call = QueryCommand.mock.calls[QueryCommand.mock.calls.length - 1][0];
    expect(call.Limit).toBe(100);
    expect(call.ScanIndexForward).toBe(false);
  });
});

describe('dynamo lib - queryFiltered', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns items with filter expression', async () => {
    mockSend.mockResolvedValue({
      Items: [{ id: 'est-1', status: 'approved' }],
      LastEvaluatedKey: undefined
    });

    const result = await db.queryFiltered(
      'COMPANY#comp-1',
      'EST#',
      '#s = :status',
      { ':status': 'approved' },
      50,
      null,
      { '#s': 'status' }
    );

    expect(result.items).toEqual([{ id: 'est-1', status: 'approved' }]);
    expect(result.nextKey).toBeNull();
  });

  test('passes filterNames as ExpressionAttributeNames', async () => {
    const { QueryCommand } = require('@aws-sdk/lib-dynamodb');
    mockSend.mockResolvedValue({ Items: [], LastEvaluatedKey: undefined });

    await db.queryFiltered(
      'COMPANY#comp-1',
      'EST#',
      '#s = :status',
      { ':status': 'draft' },
      50,
      null,
      { '#s': 'status' }
    );

    const call = QueryCommand.mock.calls[QueryCommand.mock.calls.length - 1][0];
    expect(call.ExpressionAttributeNames).toEqual({ '#s': 'status' });
    expect(call.FilterExpression).toBe('#s = :status');
  });

  test('omits ExpressionAttributeNames when filterNames is undefined', async () => {
    const { QueryCommand } = require('@aws-sdk/lib-dynamodb');
    mockSend.mockResolvedValue({ Items: [], LastEvaluatedKey: undefined });

    await db.queryFiltered(
      'COMPANY#comp-1',
      'EST#',
      'attribute_exists(photo)',
      { ':pk': 'COMPANY#comp-1', ':sk': 'EST#' }
    );

    const call = QueryCommand.mock.calls[QueryCommand.mock.calls.length - 1][0];
    expect(call.ExpressionAttributeNames).toBeUndefined();
  });

  test('returns base64-encoded nextKey when paginated', async () => {
    const lastKey = { PK: 'COMPANY#comp-1', SK: 'EST#5' };
    mockSend.mockResolvedValue({
      Items: [{ id: 'est-5' }],
      LastEvaluatedKey: lastKey
    });

    const result = await db.queryFiltered(
      'COMPANY#comp-1',
      'EST#',
      '#s = :status',
      { ':status': 'approved' },
      10
    );

    expect(result.nextKey).toBeDefined();
    const decoded = JSON.parse(Buffer.from(result.nextKey, 'base64').toString());
    expect(decoded).toEqual(lastKey);
  });

  test('passes decoded cursor as ExclusiveStartKey', async () => {
    const { QueryCommand } = require('@aws-sdk/lib-dynamodb');
    const cursorData = { PK: 'COMPANY#comp-1', SK: 'EST#3' };
    const cursor = Buffer.from(JSON.stringify(cursorData)).toString('base64');

    mockSend.mockResolvedValue({ Items: [], LastEvaluatedKey: undefined });

    await db.queryFiltered(
      'COMPANY#comp-1',
      'EST#',
      '#s = :status',
      { ':status': 'approved' },
      50,
      cursor,
      { '#s': 'status' }
    );

    const call = QueryCommand.mock.calls[QueryCommand.mock.calls.length - 1][0];
    expect(call.ExclusiveStartKey).toEqual(cursorData);
  });

  test('rejects cursor with mismatched PK (cross-tenant protection)', async () => {
    const { QueryCommand } = require('@aws-sdk/lib-dynamodb');
    const evilCursor = Buffer.from(JSON.stringify({
      PK: 'COMPANY#other-tenant',
      SK: 'EST#1'
    })).toString('base64');

    mockSend.mockResolvedValue({ Items: [], LastEvaluatedKey: undefined });

    await db.queryFiltered(
      'COMPANY#comp-1',
      'EST#',
      '#s = :status',
      { ':status': 'approved' },
      50,
      evilCursor
    );

    // Should NOT pass the tampered cursor — starts from beginning instead
    const call = QueryCommand.mock.calls[QueryCommand.mock.calls.length - 1][0];
    expect(call.ExclusiveStartKey).toBeUndefined();
  });

  test('ignores invalid base64 cursor and starts from beginning', async () => {
    const { QueryCommand } = require('@aws-sdk/lib-dynamodb');
    mockSend.mockResolvedValue({ Items: [], LastEvaluatedKey: undefined });

    await db.queryFiltered(
      'COMPANY#comp-1',
      'EST#',
      '#s = :status',
      { ':status': 'approved' },
      50,
      'not-valid-base64-json!!!'
    );

    const call = QueryCommand.mock.calls[QueryCommand.mock.calls.length - 1][0];
    expect(call.ExclusiveStartKey).toBeUndefined();
  });

  test('returns empty items array when Items is undefined', async () => {
    mockSend.mockResolvedValue({ Items: undefined, LastEvaluatedKey: undefined });

    const result = await db.queryFiltered(
      'COMPANY#comp-1',
      'EST#',
      '#s = :status',
      { ':status': 'approved' }
    );

    expect(result.items).toEqual([]);
    expect(result.nextKey).toBeNull();
  });

  test('defaults limit to 50', async () => {
    const { QueryCommand } = require('@aws-sdk/lib-dynamodb');
    mockSend.mockResolvedValue({ Items: [], LastEvaluatedKey: undefined });

    await db.queryFiltered(
      'COMPANY#comp-1',
      'EST#',
      '#s = :status',
      { ':status': 'draft' }
    );

    const call = QueryCommand.mock.calls[QueryCommand.mock.calls.length - 1][0];
    expect(call.Limit).toBe(50);
  });

  test('merges filter values with key condition values', async () => {
    const { QueryCommand } = require('@aws-sdk/lib-dynamodb');
    mockSend.mockResolvedValue({ Items: [], LastEvaluatedKey: undefined });

    await db.queryFiltered(
      'COMPANY#comp-1',
      'EST#',
      '#s = :status',
      { ':status': 'approved' },
      25
    );

    const call = QueryCommand.mock.calls[QueryCommand.mock.calls.length - 1][0];
    expect(call.ExpressionAttributeValues[':pk']).toBe('COMPANY#comp-1');
    expect(call.ExpressionAttributeValues[':sk']).toBe('EST#');
    expect(call.ExpressionAttributeValues[':status']).toBe('approved');
  });
});
