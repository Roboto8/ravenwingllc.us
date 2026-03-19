/**
 * Additional edge case tests for reports handler
 */
jest.mock('../handlers/lib/dynamo', () => ({
  get: jest.fn(),
  put: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  query: jest.fn(),
  findById: jest.fn(),
  queryGSI: jest.fn()
}));

jest.mock('../handlers/lib/auth', () => ({
  getUser: jest.fn(),
  getCompanyId: jest.fn()
}));

const db = require('../handlers/lib/dynamo');
const auth = require('../handlers/lib/auth');
const reports = require('../handlers/reports');

describe('reports handler - edge cases', () => {
  beforeEach(() => jest.clearAllMocks());

  const makeEstimate = (overrides = {}) => ({
    id: 'est-' + Math.random(),
    status: 'draft',
    fenceType: 'wood',
    totalCost: '1000',
    createdAt: '2026-03-01T00:00:00.000Z',
    ...overrides
  });

  describe('dashboard - conversion rate', () => {
    test('conversion rate is 0 when no sent/approved/declined estimates', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.query.mockResolvedValue({
        items: [
          makeEstimate({ status: 'draft' }),
          makeEstimate({ status: 'draft' })
        ],
        nextKey: null
      });

      const result = await reports.dashboard({ queryStringParameters: {} });
      const body = JSON.parse(result.body);

      expect(body.conversionRate).toBe(0);
    });

    test('conversion rate is 100% when all sent are approved', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.query.mockResolvedValue({
        items: [
          makeEstimate({ status: 'approved', totalCost: '1000' }),
          makeEstimate({ status: 'approved', totalCost: '2000' })
        ],
        nextKey: null
      });

      const result = await reports.dashboard({ queryStringParameters: {} });
      const body = JSON.parse(result.body);

      // Both approved count in both approved and sent categories
      expect(body.conversionRate).toBe(100);
    });

    test('conversion rate calculation includes declined in denominator', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.query.mockResolvedValue({
        items: [
          makeEstimate({ status: 'approved' }),
          makeEstimate({ status: 'sent' }),
          makeEstimate({ status: 'declined' }),
          makeEstimate({ status: 'draft' }) // not counted in conversion
        ],
        nextKey: null
      });

      const result = await reports.dashboard({ queryStringParameters: {} });
      const body = JSON.parse(result.body);

      // sent count: approved(1) + sent(1) + declined(1) = 3
      // approved count: 1
      // conversion: 1/3 = 33.3%
      expect(body.conversionRate).toBeCloseTo(33.3, 0);
    });
  });

  describe('dashboard - year rollover in month grouping', () => {
    test('groups estimates across different years', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.query.mockResolvedValue({
        items: [
          makeEstimate({ createdAt: '2025-11-15T00:00:00.000Z' }),
          makeEstimate({ createdAt: '2025-11-20T00:00:00.000Z' }),
          makeEstimate({ createdAt: '2026-03-05T00:00:00.000Z' }),
          makeEstimate({ createdAt: '2026-03-10T00:00:00.000Z' }),
          makeEstimate({ createdAt: '2026-06-01T00:00:00.000Z' })
        ],
        nextKey: null
      });

      const result = await reports.dashboard({ queryStringParameters: {} });
      const body = JSON.parse(result.body);

      // Estimates span 3 different months across 2 years
      expect(body.estimatesByMonth.length).toBeGreaterThanOrEqual(3);
      expect(body.totalEstimates).toBe(5);
      // Sorted chronologically
      const months = body.estimatesByMonth.map(m => m.month);
      expect(months).toEqual([...months].sort());
    });
  });

  describe('dashboard - totalCost parsing', () => {
    test('handles totalCost as number', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.query.mockResolvedValue({
        items: [makeEstimate({ status: 'approved', totalCost: 1500 })],
        nextKey: null
      });

      const result = await reports.dashboard({ queryStringParameters: {} });
      const body = JSON.parse(result.body);

      expect(body.totalRevenue).toBe(1500);
    });

    test('handles totalCost as string', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.query.mockResolvedValue({
        items: [makeEstimate({ status: 'approved', totalCost: '2500.50' })],
        nextKey: null
      });

      const result = await reports.dashboard({ queryStringParameters: {} });
      const body = JSON.parse(result.body);

      expect(body.totalRevenue).toBe(2500.5);
    });

    test('handles invalid totalCost as 0', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.query.mockResolvedValue({
        items: [makeEstimate({ status: 'approved', totalCost: 'not-a-number' })],
        nextKey: null
      });

      const result = await reports.dashboard({ queryStringParameters: {} });
      const body = JSON.parse(result.body);

      expect(body.totalRevenue).toBe(0);
    });

    test('handles undefined totalCost as 0', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.query.mockResolvedValue({
        items: [makeEstimate({ status: 'approved', totalCost: undefined })],
        nextKey: null
      });

      const result = await reports.dashboard({ queryStringParameters: {} });
      const body = JSON.parse(result.body);

      expect(body.totalRevenue).toBe(0);
    });
  });

  describe('dashboard - multiple fence types', () => {
    test('all unknown fenceType entries grouped together', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.query.mockResolvedValue({
        items: [
          makeEstimate({ fenceType: undefined }),
          makeEstimate({ fenceType: undefined }),
          makeEstimate({ fenceType: 'wood' })
        ],
        nextKey: null
      });

      const result = await reports.dashboard({ queryStringParameters: {} });
      const body = JSON.parse(result.body);

      const unknown = body.topMaterials.find(m => m.material === 'unknown');
      expect(unknown.count).toBe(2);
    });

    test('topMaterials sorted by count descending', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.query.mockResolvedValue({
        items: [
          makeEstimate({ fenceType: 'iron' }),
          makeEstimate({ fenceType: 'vinyl' }),
          makeEstimate({ fenceType: 'vinyl' }),
          makeEstimate({ fenceType: 'wood' }),
          makeEstimate({ fenceType: 'wood' }),
          makeEstimate({ fenceType: 'wood' })
        ],
        nextKey: null
      });

      const result = await reports.dashboard({ queryStringParameters: {} });
      const body = JSON.parse(result.body);

      expect(body.topMaterials[0].material).toBe('wood');
      expect(body.topMaterials[0].count).toBe(3);
      expect(body.topMaterials[1].material).toBe('vinyl');
      expect(body.topMaterials[1].count).toBe(2);
      expect(body.topMaterials[2].material).toBe('iron');
      expect(body.topMaterials[2].count).toBe(1);
    });
  });

  describe('dashboard - revenue rounding', () => {
    test('rounds revenue to 2 decimal places', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.query.mockResolvedValue({
        items: [
          makeEstimate({ status: 'approved', totalCost: '33.33' }),
          makeEstimate({ status: 'approved', totalCost: '33.33' }),
          makeEstimate({ status: 'approved', totalCost: '33.34' })
        ],
        nextKey: null
      });

      const result = await reports.dashboard({ queryStringParameters: {} });
      const body = JSON.parse(result.body);

      expect(body.totalRevenue).toBe(100);
    });

    test('rounds average estimate value to 2 decimal places', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.query.mockResolvedValue({
        items: [
          makeEstimate({ totalCost: '100' }),
          makeEstimate({ totalCost: '200' }),
          makeEstimate({ totalCost: '300' })
        ],
        nextKey: null
      });

      const result = await reports.dashboard({ queryStringParameters: {} });
      const body = JSON.parse(result.body);

      expect(body.averageEstimateValue).toBe(200);
    });
  });

  describe('dashboard - period filter edge cases', () => {
    test('unknown period returns all estimates', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.query.mockResolvedValue({
        items: [
          makeEstimate({ createdAt: '2020-01-01T00:00:00Z' }),
          makeEstimate({ createdAt: new Date().toISOString() })
        ],
        nextKey: null
      });

      const result = await reports.dashboard({
        queryStringParameters: { period: 'invalid' }
      });
      const body = JSON.parse(result.body);

      expect(body.totalEstimates).toBe(2);
    });

    test('12m period filters correctly', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      const recent = makeEstimate({ createdAt: new Date().toISOString() });
      const twoYearsAgo = makeEstimate({
        createdAt: new Date(Date.now() - 730 * 24 * 60 * 60 * 1000).toISOString()
      });
      db.query.mockResolvedValue({ items: [recent, twoYearsAgo], nextKey: null });

      const result = await reports.dashboard({
        queryStringParameters: { period: '12m' }
      });
      const body = JSON.parse(result.body);

      expect(body.totalEstimates).toBe(1);
    });
  });
});
