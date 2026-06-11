// Manual BOM compare — the contractor-private worksheet matcher
// (mirror of app.js compareManualBom; compare-only, never feeds totals)
const { normalizeBomName, compareManualBom } = require('../client/dist/js/bom');

describe('normalizeBomName', () => {
  test('lowercases, strips punctuation, collapses whitespace', () => {
    expect(normalizeBomName('4x4x8 PT  Posts!')).toBe('4x4x8 pt posts');
    expect(normalizeBomName('  Rail-Brackets (galv.) ')).toBe('rail brackets galv');
    expect(normalizeBomName(null)).toBe('');
  });
});

describe('compareManualBom', () => {
  const computed = [
    { name: 'Section 1: Wood 6ft — 120 ft', qty: 0, isHeader: true },
    { name: '4x4x8 PT posts', qty: 19, unitCost: 16, total: 304 },
    { name: '2x4x16 rails', qty: 23, unitCost: 9, total: 207 },
    { name: 'Concrete bags (50lb)', qty: 38, unitCost: 6, total: 228 }
  ];

  test('exact name match (case/punctuation-insensitive) with qty delta', () => {
    const r = compareManualBom([{ name: '4X4X8 pt POSTS', qty: 17, unitCost: 15 }], computed);
    expect(r.rows[0].countedName).toBe('4x4x8 PT posts');
    expect(r.rows[0].countedQty).toBe(19);
    expect(r.rows[0].qtyDelta).toBe(2); // FenceTrace counts 2 more
  });

  test('substring match when no exact match', () => {
    const r = compareManualBom([{ name: 'concrete bags', qty: 38 }], computed);
    expect(r.rows[0].countedName).toBe('Concrete bags (50lb)');
    expect(r.rows[0].qtyDelta).toBe(0);
  });

  test('headers are never matched', () => {
    const r = compareManualBom([{ name: 'Section 1', qty: 1 }], computed);
    expect(r.rows[0].countedName).toBeNull();
  });

  test('exact match wins even when an earlier row would substring-claim it', () => {
    const r = compareManualBom(
      [{ name: 'posts', qty: 5 }, { name: '4x4x8 PT posts', qty: 17 }],
      computed
    );
    expect(r.rows[1].countedName).toBe('4x4x8 PT posts');
    expect(r.rows[0].countedName).toBeNull();
  });

  test('a computed item is matched at most once', () => {
    const r = compareManualBom(
      [{ name: '4x4x8 PT posts', qty: 10 }, { name: '4x4x8 posts', qty: 5 }],
      computed
    );
    expect(r.rows[0].countedName).toBe('4x4x8 PT posts');
    expect(r.rows[1].countedName).toBeNull();
  });

  test('short names (<3 chars) only match exactly, not by substring', () => {
    const r = compareManualBom([{ name: 'pt', qty: 1 }], computed);
    expect(r.rows[0].countedName).toBeNull();
  });

  test('unmatched computed items are listed', () => {
    const r = compareManualBom([{ name: '4x4x8 PT posts', qty: 19 }], computed);
    expect(r.unmatchedComputed).toEqual([
      { name: '2x4x16 rails', qty: 23 },
      { name: 'Concrete bags (50lb)', qty: 38 }
    ]);
  });

  test('manualTotal sums qty*unitCost with cent rounding', () => {
    const r = compareManualBom(
      [{ name: 'a-item', qty: 3, unitCost: 1.335 }, { name: 'b-item', qty: 1 }],
      []
    );
    expect(r.manualTotal).toBe(4.01); // 4.005 rounded
    expect(r.rows[1].unitCost).toBe(0);
  });

  test('empty and missing inputs degrade safely', () => {
    expect(compareManualBom([], computed).rows).toEqual([]);
    expect(compareManualBom(null, null)).toEqual({ rows: [], manualTotal: 0, unmatchedComputed: [] });
  });
});
