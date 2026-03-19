/**
 * Shared in-memory DynamoDB mock for integration testing.
 * Supports primary key get/put/update/remove, prefix queries, and GSI1 queries.
 */
class MockDB {
  constructor() {
    this.items = [];
  }

  reset() {
    this.items = [];
  }

  seed(records) {
    this.items.push(...records);
  }

  // Get a single item by PK + SK
  async get(pk, sk) {
    return this.items.find(i => i.PK === pk && i.SK === sk) || null;
  }

  // Put (upsert) an item
  async put(item) {
    const idx = this.items.findIndex(i => i.PK === item.PK && i.SK === item.SK);
    if (idx >= 0) {
      this.items[idx] = { ...item };
    } else {
      this.items.push({ ...item });
    }
    return item;
  }

  // Partial update by PK + SK
  async update(pk, sk, updates) {
    const item = this.items.find(i => i.PK === pk && i.SK === sk);
    if (!item) {
      // DynamoDB creates the item if it doesn't exist
      const newItem = { PK: pk, SK: sk, ...updates };
      this.items.push(newItem);
      return newItem;
    }
    Object.assign(item, updates);
    return { ...item };
  }

  // Delete by PK + SK
  async remove(pk, sk) {
    const idx = this.items.findIndex(i => i.PK === pk && i.SK === sk);
    if (idx >= 0) this.items.splice(idx, 1);
  }

  // Query by PK + SK prefix, with optional limit and cursor
  async query(pk, skPrefix, limit = 50, lastKey) {
    let matches = this.items
      .filter(i => i.PK === pk && i.SK.startsWith(skPrefix))
      .sort((a, b) => b.SK.localeCompare(a.SK)); // ScanIndexForward: false

    let startIdx = 0;
    if (lastKey) {
      try {
        const decoded = JSON.parse(Buffer.from(lastKey, 'base64').toString());
        const pos = matches.findIndex(i => i.PK === decoded.PK && i.SK === decoded.SK);
        if (pos >= 0) startIdx = pos + 1;
      } catch (e) {
        // bad cursor, start from beginning
      }
    }

    const page = matches.slice(startIdx, startIdx + limit);
    const hasMore = startIdx + limit < matches.length;
    const nextKey = hasMore
      ? Buffer.from(JSON.stringify({ PK: page[page.length - 1].PK, SK: page[page.length - 1].SK })).toString('base64')
      : null;

    return { items: page.map(i => ({ ...i })), nextKey };
  }

  // Find a single item by PK + SK prefix + id field
  async findById(pk, skPrefix, id) {
    return this.items.find(i => i.PK === pk && i.SK.startsWith(skPrefix) && i.id === id) || null;
  }

  // Query GSI1 by GSI1PK
  async queryGSI(gsi1pk) {
    return this.items
      .filter(i => i.GSI1PK === gsi1pk)
      .map(i => ({ ...i }));
  }
}

module.exports = { MockDB };
