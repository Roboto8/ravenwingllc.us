const { notify } = require('../handlers/lib/notify');

describe('notify helper', () => {
  const mockDb = {
    put: jest.fn().mockResolvedValue({})
  };

  beforeEach(() => jest.clearAllMocks());

  test('creates notification with all fields', async () => {
    const item = await notify(mockDb, 'comp-1', {
      type: 'approval',
      title: 'Estimate Approved',
      message: 'Jane approved the estimate',
      link: '/estimates/est-1'
    });

    expect(mockDb.put).toHaveBeenCalledTimes(1);
    const putArg = mockDb.put.mock.calls[0][0];

    expect(putArg.PK).toBe('COMPANY#comp-1');
    expect(putArg.SK).toMatch(/^NOTIF#/);
    expect(putArg.type).toBe('approval');
    expect(putArg.title).toBe('Estimate Approved');
    expect(putArg.message).toBe('Jane approved the estimate');
    expect(putArg.link).toBe('/estimates/est-1');
    expect(putArg.read).toBe(false);
    expect(putArg.id).toBeDefined();
    expect(putArg.createdAt).toBeDefined();
    expect(putArg.expiresAt).toBeGreaterThan(0);
  });

  test('defaults type to info when not provided', async () => {
    const item = await notify(mockDb, 'comp-1', {
      title: 'Info notification'
    });

    const putArg = mockDb.put.mock.calls[0][0];
    expect(putArg.type).toBe('info');
  });

  test('defaults message to empty string', async () => {
    const item = await notify(mockDb, 'comp-1', {
      title: 'No message'
    });

    const putArg = mockDb.put.mock.calls[0][0];
    expect(putArg.message).toBe('');
  });

  test('defaults link to empty string', async () => {
    const item = await notify(mockDb, 'comp-1', {
      title: 'No link'
    });

    const putArg = mockDb.put.mock.calls[0][0];
    expect(putArg.link).toBe('');
  });

  test('returns the created item', async () => {
    const item = await notify(mockDb, 'comp-1', {
      title: 'Test'
    });

    expect(item.PK).toBe('COMPANY#comp-1');
    expect(item.title).toBe('Test');
    expect(item.id).toBeDefined();
  });

  test('expiresAt is approximately 90 days from now', async () => {
    const item = await notify(mockDb, 'comp-1', { title: 'TTL test' });

    const expectedTtl = Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60);
    expect(item.expiresAt).toBeGreaterThan(expectedTtl - 10);
    expect(item.expiresAt).toBeLessThan(expectedTtl + 10);
  });
});
