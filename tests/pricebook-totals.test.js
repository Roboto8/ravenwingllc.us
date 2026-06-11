// Price-book labor/markup money math (mirror of app.js contractor summary)
const { pricebookNumber, resolveLaborRate, computeContractorTotals } = require('../client/dist/js/bom');

describe('pricebookNumber', () => {
  test('returns finite non-negative numbers only', () => {
    expect(pricebookNumber({ a: 5 }, 'a')).toBe(5);
    expect(pricebookNumber({ a: 0 }, 'a')).toBe(0);
    expect(pricebookNumber({ a: -1 }, 'a')).toBeUndefined();
    expect(pricebookNumber({ a: 'x' }, 'a')).toBeUndefined();
    expect(pricebookNumber({ a: NaN }, 'a')).toBeUndefined();
    expect(pricebookNumber(undefined, 'a')).toBeUndefined();
  });
});

describe('resolveLaborRate', () => {
  const pb = { 'labor.wood.6': 12, 'labor.default': 8 };
  test('per-job value wins', () => {
    expect(resolveLaborRate(pb, 'wood', 6, 15)).toBe(15);
  });
  test('falls back to type+height rate, then default, then 0', () => {
    expect(resolveLaborRate(pb, 'wood', 6)).toBe(12);
    expect(resolveLaborRate(pb, 'vinyl', 6)).toBe(8);
    expect(resolveLaborRate({}, 'vinyl', 6)).toBe(0);
  });
  test('zero/blank per-job value defers to the price book', () => {
    expect(resolveLaborRate(pb, 'wood', 6, 0)).toBe(12);
  });
});

describe('computeContractorTotals', () => {
  test('labor (per-ft + per-gate) + markup build the customer price', () => {
    const t = computeContractorTotals({
      subtotal: 3000, feet: 100, gateCount: 2, fenceType: 'wood', height: 6,
      pricebook: { 'labor.wood.6': 10, 'labor.gate': 75, 'markup.percent': 20 },
    });
    expect(t.laborCost).toBe(1150); // 100*10 + 2*75
    expect(t.markupAmt).toBe(600);  // 20% of 3000
    expect(t.customerPrice).toBe(4750);
    expect(t.profit).toBe(1750);
    expect(t.marginPct).toBe(37);
  });

  test('per-job labor and markup override the price book', () => {
    const t = computeContractorTotals({
      subtotal: 1000, feet: 50, fenceType: 'wood', height: 6,
      laborPerFt: 5, markupPct: 10,
      pricebook: { 'labor.wood.6': 99, 'markup.percent': 99 },
    });
    expect(t.laborCost).toBe(250);
    expect(t.markupAmt).toBe(100);
  });

  test('job minimum is a floor: price is raised, bump lands in profit', () => {
    const pb = { 'markup.jobMin': 2000 };
    const raised = computeContractorTotals({ subtotal: 1500, feet: 0, pricebook: pb });
    expect(raised.raisedToMinimum).toBe(true);
    expect(raised.belowMinimum).toBe(true); // legacy alias
    expect(raised.customerPrice).toBe(2000);
    expect(raised.profit).toBe(500);

    const above = computeContractorTotals({ subtotal: 2500, feet: 0, pricebook: pb });
    expect(above.raisedToMinimum).toBe(false);
    expect(above.customerPrice).toBe(2500);

    const empty = computeContractorTotals({ subtotal: 0, feet: 0, pricebook: pb });
    expect(empty.raisedToMinimum).toBe(false);
    expect(empty.customerPrice).toBe(0);
  });

  test('job minimum floors the labor+markup price, not just the subtotal', () => {
    const t = computeContractorTotals({
      subtotal: 1000, feet: 50, fenceType: 'wood', height: 6,
      pricebook: { 'labor.default': 5, 'markup.percent': 10, 'markup.jobMin': 1500 },
    });
    // 1000 + 250 labor + 100 markup = 1350 → floored to 1500
    expect(t.customerPrice).toBe(1500);
    expect(t.raisedToMinimum).toBe(true);
    expect(t.profit).toBe(500);
  });

  test('empty pricebook degrades to plain subtotal', () => {
    const t = computeContractorTotals({ subtotal: 1234, feet: 80, gateCount: 1 });
    expect(t.customerPrice).toBe(1234);
    expect(t.profit).toBe(0);
    expect(t.marginPct).toBe(0);
    expect(t.belowMinimum).toBe(false);
  });
});
