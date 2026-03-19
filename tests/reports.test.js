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

describe('reports handler', () => {
  beforeEach(() => jest.clearAllMocks());

  const makeEstimate = (overrides = {}) => ({
    id: 'est-' + Math.random(),
    status: 'draft',
    fenceType: 'wood',
    totalCost: '1000',
    createdAt: '2026-03-01T00:00:00.000Z',
    ...overrides
  });

  describe('dashboard', () => {
    test('returns all metrics', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.query.mockResolvedValue({
        items: [
          makeEstimate({ status: 'approved', totalCost: '2000' }),
          makeEstimate({ status: 'approved', totalCost: '3000' }),
          makeEstimate({ status: 'draft', totalCost: '1500' }),
          makeEstimate({ status: 'sent', totalCost: '1000' })
        ],
        nextKey: null
      });

      const result = await reports.dashboard({ queryStringParameters: {} });
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.totalEstimates).toBe(4);
      expect(body.totalRevenue).toBe(5000);
      expect(body.averageEstimateValue).toBe(1875);
      expect(body.estimatesByStatus).toEqual({ approved: 2, draft: 1, sent: 1 });
      expect(body.topMaterials).toEqual([{ material: 'wood', count: 4 }]);
      expect(body.estimatesByMonth).toHaveLength(1);
    });

    test('filters deleted estimates', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.query.mockResolvedValue({
        items: [
          makeEstimate({ status: 'draft' }),
          makeEstimate({ status: 'deleted' })
        ],
        nextKey: null
      });

      const result = await reports.dashboard({ queryStringParameters: {} });
      const body = JSON.parse(result.body);

      expect(body.totalEstimates).toBe(1);
    });

    test('handles empty estimates', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.query.mockResolvedValue({ items: [], nextKey: null });

      const result = await reports.dashboard({ queryStringParameters: {} });
      const body = JSON.parse(result.body);

      expect(body.totalEstimates).toBe(0);
      expect(body.totalRevenue).toBe(0);
      expect(body.conversionRate).toBe(0);
      expect(body.averageEstimateValue).toBe(0);
    });

    test('groups by month correctly', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.query.mockResolvedValue({
        items: [
          makeEstimate({ createdAt: '2026-01-15T00:00:00Z' }),
          makeEstimate({ createdAt: '2026-01-20T00:00:00Z' }),
          makeEstimate({ createdAt: '2026-03-01T00:00:00Z' })
        ],
        nextKey: null
      });

      const result = await reports.dashboard({ queryStringParameters: {} });
      const body = JSON.parse(result.body);

      expect(body.estimatesByMonth).toHaveLength(2);
      expect(body.estimatesByMonth[0].month).toBe('2026-01');
      expect(body.estimatesByMonth[0].count).toBe(2);
    });

    test('tracks top materials', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.query.mockResolvedValue({
        items: [
          makeEstimate({ fenceType: 'wood' }),
          makeEstimate({ fenceType: 'wood' }),
          makeEstimate({ fenceType: 'vinyl' }),
          makeEstimate({ fenceType: 'chain-link' }),
          makeEstimate({ fenceType: 'chain-link' }),
          makeEstimate({ fenceType: 'chain-link' })
        ],
        nextKey: null
      });

      const result = await reports.dashboard({ queryStringParameters: {} });
      const body = JSON.parse(result.body);

      expect(body.topMaterials[0]).toEqual({ material: 'chain-link', count: 3 });
      expect(body.topMaterials[1]).toEqual({ material: 'wood', count: 2 });
    });

    test('returns 403 when no auth', async () => {
      auth.getCompanyId.mockResolvedValue(null);
      const result = await reports.dashboard({ queryStringParameters: {} });
      expect(result.statusCode).toBe(403);
    });

    test('filters by 30d period', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      const recent = makeEstimate({ createdAt: new Date().toISOString() });
      const old = makeEstimate({ createdAt: '2020-01-01T00:00:00.000Z' });
      db.query.mockResolvedValue({ items: [recent, old], nextKey: null });

      const result = await reports.dashboard({ queryStringParameters: { period: '30d' } });
      const body = JSON.parse(result.body);

      expect(body.totalEstimates).toBe(1);
    });

    test('filters by 90d period', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      const recent = makeEstimate({ createdAt: new Date().toISOString() });
      const old = makeEstimate({ createdAt: '2020-01-01T00:00:00.000Z' });
      db.query.mockResolvedValue({ items: [recent, old], nextKey: null });

      const result = await reports.dashboard({ queryStringParameters: { period: '90d' } });
      const body = JSON.parse(result.body);

      expect(body.totalEstimates).toBe(1);
    });

    test('filters by 12m period', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      const recent = makeEstimate({ createdAt: new Date().toISOString() });
      const old = makeEstimate({ createdAt: '2020-01-01T00:00:00.000Z' });
      db.query.mockResolvedValue({ items: [recent, old], nextKey: null });

      const result = await reports.dashboard({ queryStringParameters: { period: '12m' } });
      const body = JSON.parse(result.body);

      expect(body.totalEstimates).toBe(1);
    });

    test('paginates through multiple query pages', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.query
        .mockResolvedValueOnce({
          items: [makeEstimate()],
          nextKey: 'cursor1'
        })
        .mockResolvedValueOnce({
          items: [makeEstimate()],
          nextKey: null
        });

      const result = await reports.dashboard({ queryStringParameters: {} });
      const body = JSON.parse(result.body);

      expect(body.totalEstimates).toBe(2);
      expect(db.query).toHaveBeenCalledTimes(2);
    });

    test('handles null queryStringParameters', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.query.mockResolvedValue({ items: [], nextKey: null });

      const result = await reports.dashboard({ queryStringParameters: null });
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.totalEstimates).toBe(0);
    });

    test('tracks revenue by month for approved estimates', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.query.mockResolvedValue({
        items: [
          makeEstimate({ status: 'approved', totalCost: '500', createdAt: '2026-01-10T00:00:00Z' }),
          makeEstimate({ status: 'draft', totalCost: '300', createdAt: '2026-01-20T00:00:00Z' })
        ],
        nextKey: null
      });

      const result = await reports.dashboard({ queryStringParameters: {} });
      const body = JSON.parse(result.body);

      expect(body.estimatesByMonth[0].revenue).toBe(500);
    });

    test('estimates with missing fenceType counted as unknown', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.query.mockResolvedValue({
        items: [makeEstimate({ fenceType: undefined })],
        nextKey: null
      });

      const result = await reports.dashboard({ queryStringParameters: {} });
      const body = JSON.parse(result.body);

      expect(body.topMaterials[0].material).toBe('unknown');
    });

    test('estimates with missing status counted as draft', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.query.mockResolvedValue({
        items: [makeEstimate({ status: undefined })],
        nextKey: null
      });

      const result = await reports.dashboard({ queryStringParameters: {} });
      const body = JSON.parse(result.body);

      expect(body.estimatesByStatus.draft).toBe(1);
    });
  });
});
