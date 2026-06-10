jest.mock('../handlers/lib/dynamo', () => ({
  get: jest.fn(),
  put: jest.fn(),
  update: jest.fn(),
  query: jest.fn(),
  queryGSI: jest.fn()
}));

jest.mock('../handlers/lib/notify', () => ({
  notify: jest.fn().mockResolvedValue({})
}));

const db = require('../handlers/lib/dynamo');
const { notify } = require('../handlers/lib/notify');
const leads = require('../handlers/leads');

const COMPANY_ID = 'comp-12345678';
const mockCompany = {
  id: COMPANY_ID, name: "Sam's Fence", accentColor: '#c0622e',
  tagline: 'Fences since 1976', email: 'secret@samsfences.com',
  pricebook: { 'wood.picket': 4.5 }, stripeCustomerId: 'cus_secret'
};

function leadEvent(overrides) {
  return {
    body: JSON.stringify(Object.assign({
      companyId: COMPANY_ID,
      name: 'Jane Homeowner',
      phone: '804-555-0100',
      email: 'jane@example.com',
      address: '12 Oak St',
      totalFeet: 150,
      totalCost: 6200,
      fenceType: 'wood',
      fenceHeight: 6
    }, overrides))
  };
}

describe('leads handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    for (const k in leads._leadTimestamps) delete leads._leadTimestamps[k];
  });

  describe('getPublicCompany', () => {
    test('returns only public fields', async () => {
      db.get.mockResolvedValue(mockCompany);
      const result = await leads.getPublicCompany({ pathParameters: { id: COMPANY_ID } });
      const body = JSON.parse(result.body);
      expect(result.statusCode).toBe(200);
      expect(body.name).toBe("Sam's Fence");
      expect(body.accentColor).toBe('#c0622e');
      expect(body.email).toBeUndefined();
      expect(body.pricebook).toBeUndefined();
      expect(body.stripeCustomerId).toBeUndefined();
    });

    test('404 for unknown company', async () => {
      db.get.mockResolvedValue(null);
      const result = await leads.getPublicCompany({ pathParameters: { id: 'comp-99999999' } });
      expect(result.statusCode).toBe(404);
    });

    test('rejects malformed ids', async () => {
      const result = await leads.getPublicCompany({ pathParameters: { id: 'x;DROP TABLE' } });
      expect(result.statusCode).toBe(400);
      expect(db.get).not.toHaveBeenCalled();
    });
  });

  describe('createLead', () => {
    test('stores lead as estimate and notifies company', async () => {
      db.get.mockResolvedValue(mockCompany);
      db.put.mockResolvedValue({});

      const result = await leads.createLead(leadEvent());
      expect(result.statusCode).toBe(200);

      expect(db.put).toHaveBeenCalledWith(expect.objectContaining({
        PK: 'COMPANY#' + COMPANY_ID,
        SK: expect.stringMatching(/^EST#/),
        source: 'website-widget',
        customerName: 'Jane Homeowner',
        customerPhone: '804-555-0100',
        totalFeet: 150,
        totalCost: 6200,
        status: 'draft'
      }));

      expect(notify).toHaveBeenCalledWith(db, COMPANY_ID, expect.objectContaining({
        type: 'lead',
        title: 'New website lead',
        message: expect.stringContaining('Jane Homeowner')
      }));
    });

    test('requires a name', async () => {
      db.get.mockResolvedValue(mockCompany);
      const result = await leads.createLead(leadEvent({ name: '  ' }));
      expect(result.statusCode).toBe(400);
      expect(db.put).not.toHaveBeenCalled();
    });

    test('requires phone or email', async () => {
      db.get.mockResolvedValue(mockCompany);
      const result = await leads.createLead(leadEvent({ phone: '', email: '' }));
      expect(result.statusCode).toBe(400);
    });

    test('rejects invalid email', async () => {
      db.get.mockResolvedValue(mockCompany);
      const result = await leads.createLead(leadEvent({ phone: '', email: 'not-an-email' }));
      expect(result.statusCode).toBe(400);
    });

    test('404 when company does not exist', async () => {
      db.get.mockResolvedValue(null);
      const result = await leads.createLead(leadEvent());
      expect(result.statusCode).toBe(404);
      expect(db.put).not.toHaveBeenCalled();
    });

    test('clamps absurd numeric values', async () => {
      db.get.mockResolvedValue(mockCompany);
      db.put.mockResolvedValue({});
      await leads.createLead(leadEvent({ totalFeet: 99999999, totalCost: -50, fenceHeight: 900 }));
      expect(db.put).toHaveBeenCalledWith(expect.objectContaining({
        totalFeet: 100000,
        totalCost: 0,
        fenceHeight: 20
      }));
    });

    test('rate limits rapid submissions per company', async () => {
      db.get.mockResolvedValue(mockCompany);
      db.put.mockResolvedValue({});
      const first = await leads.createLead(leadEvent());
      const second = await leads.createLead(leadEvent({ name: 'Other Person' }));
      expect(first.statusCode).toBe(200);
      expect(second.statusCode).toBe(429);
      expect(db.put).toHaveBeenCalledTimes(1);
    });

    test('caps oversized fields', async () => {
      db.get.mockResolvedValue(mockCompany);
      const result = await leads.createLead(leadEvent({ name: 'x'.repeat(300) }));
      expect(result.statusCode).toBe(400);
    });
  });
});
