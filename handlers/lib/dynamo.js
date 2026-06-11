const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, DeleteCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const TABLE = process.env.DYNAMODB_TABLE;

module.exports = {
  async get(pk, sk) {
    const { Item } = await ddb.send(new GetCommand({ TableName: TABLE, Key: { PK: pk, SK: sk } }));
    return Item;
  },

  async put(item) {
    await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));
    return item;
  },

  // Atomic claim: write only if no item with this key exists.
  // Returns true if the claim won, false if another writer got there first.
  async putIfNotExists(item) {
    try {
      await ddb.send(new PutCommand({
        TableName: TABLE,
        Item: item,
        ConditionExpression: 'attribute_not_exists(PK)'
      }));
      return true;
    } catch (e) {
      if (e.name === 'ConditionalCheckFailedException') return false;
      throw e;
    }
  },

  async update(pk, sk, updates) {
    const keys = Object.keys(updates);
    const expr = keys.map((k, i) => `#k${i} = :v${i}`).join(', ');
    const names = {};
    const values = {};
    keys.forEach((k, i) => {
      names[`#k${i}`] = k;
      values[`:v${i}`] = updates[k];
    });

    const { Attributes } = await ddb.send(new UpdateCommand({
      TableName: TABLE,
      Key: { PK: pk, SK: sk },
      UpdateExpression: 'SET ' + expr,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: 'ALL_NEW'
    }));
    return Attributes;
  },

  // Update only while `guardAttr` is still unset on the item — used to make
  // read-create-attach flows (e.g. Stripe customer creation) single-winner.
  // Returns the updated item, or null if the condition failed (someone else won).
  async updateIfNotSet(pk, sk, updates, guardAttr) {
    const keys = Object.keys(updates);
    const expr = keys.map((k, i) => `#k${i} = :v${i}`).join(', ');
    const names = { '#guard': guardAttr };
    const values = {};
    keys.forEach((k, i) => {
      names[`#k${i}`] = k;
      values[`:v${i}`] = updates[k];
    });
    try {
      const { Attributes } = await ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: { PK: pk, SK: sk },
        UpdateExpression: 'SET ' + expr,
        ConditionExpression: 'attribute_not_exists(#guard) OR #guard = :empty',
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: { ...values, ':empty': '' },
        ReturnValues: 'ALL_NEW'
      }));
      return Attributes;
    } catch (e) {
      if (e.name === 'ConditionalCheckFailedException') return null;
      throw e;
    }
  },

  async remove(pk, sk) {
    await ddb.send(new DeleteCommand({ TableName: TABLE, Key: { PK: pk, SK: sk } }));
  },

  async query(pk, skPrefix, limit = 50, lastKey) {
    const params = {
      TableName: TABLE,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: { ':pk': pk, ':sk': skPrefix },
      Limit: limit,
      ScanIndexForward: false
    };
    if (lastKey) {
      try {
        const decoded = JSON.parse(Buffer.from(lastKey, 'base64').toString());
        // Validate cursor PK matches the query partition to prevent cross-tenant enumeration
        if (decoded.PK && decoded.PK !== pk) {
          throw new Error('Invalid cursor');
        }
        params.ExclusiveStartKey = decoded;
      } catch (e) {
        // Invalid or tampered cursor — ignore and start from beginning
      }
    }

    const { Items, LastEvaluatedKey } = await ddb.send(new QueryCommand(params));
    return {
      items: Items || [],
      nextKey: LastEvaluatedKey ? Buffer.from(JSON.stringify(LastEvaluatedKey)).toString('base64') : null
    };
  },

  async findById(pk, skPrefix, id) {
    let lastKey = null;
    do {
      const params = {
        TableName: TABLE,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: { ':pk': pk, ':sk': skPrefix },
        Limit: 100,
        ScanIndexForward: false
      };
      if (lastKey) params.ExclusiveStartKey = lastKey;
      const { Items, LastEvaluatedKey } = await ddb.send(new QueryCommand(params));
      const match = (Items || []).find(i => i.id === id);
      if (match) return match;
      lastKey = LastEvaluatedKey;
    } while (lastKey);
    return null;
  },

  async queryFiltered(pk, skPrefix, filterExpr, filterValues, limit = 50, lastKey, filterNames) {
    const params = {
      TableName: TABLE,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      FilterExpression: filterExpr,
      ExpressionAttributeValues: { ':pk': pk, ':sk': skPrefix, ...filterValues },
      Limit: limit,
      ScanIndexForward: false
    };
    if (filterNames) params.ExpressionAttributeNames = filterNames;
    if (lastKey) {
      try {
        const decoded = JSON.parse(Buffer.from(lastKey, 'base64').toString());
        if (decoded.PK && decoded.PK !== pk) throw new Error('Invalid cursor');
        params.ExclusiveStartKey = decoded;
      } catch (e) {
        // Invalid cursor — start from beginning
      }
    }
    const { Items, LastEvaluatedKey } = await ddb.send(new QueryCommand(params));
    return {
      items: Items || [],
      nextKey: LastEvaluatedKey ? Buffer.from(JSON.stringify(LastEvaluatedKey)).toString('base64') : null
    };
  },

  async queryGSI(gsi1pk) {
    const { Items } = await ddb.send(new QueryCommand({
      TableName: TABLE,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk',
      ExpressionAttributeValues: { ':pk': gsi1pk }
    }));
    return Items || [];
  }
};
