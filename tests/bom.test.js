const {
  BOM,
  calculateBOM,
  catmullRom,
  getSplinePoints,
  calculateFootage,
  distBetween,
  getPrice,
  encodeEstimate,
  decodeEstimate,
  customItemsTotal
} = require('../client/preview/js/bom');

// =============================================================================
// BOM DATA STRUCTURE
// =============================================================================
describe('BOM data structure', () => {
  const fenceTypes = ['wood', 'vinyl', 'chain-link', 'aluminum', 'iron'];
  const heights = [4, 6, 8];

  test.each(fenceTypes)('%s has postSpacing defined', (type) => {
    expect(BOM[type].postSpacing).toBeGreaterThan(0);
  });

  test.each(fenceTypes)('%s has extras defined', (type) => {
    expect(BOM[type].extras).toBeDefined();
    expect(typeof BOM[type].extras).toBe('object');
  });

  test.each(fenceTypes)('%s has all three height configs', (type) => {
    heights.forEach(h => {
      expect(BOM[type].heights[h]).toBeDefined();
    });
  });

  test('wood heights have picket data', () => {
    heights.forEach(h => {
      const data = BOM.wood.heights[h];
      expect(data.pickets).toBe(17);
      expect(data.picketCost).toBeGreaterThan(0);
      expect(data.rails).toBeGreaterThanOrEqual(2);
    });
  });

  test('vinyl heights have panel data', () => {
    heights.forEach(h => {
      const data = BOM.vinyl.heights[h];
      expect(data.panelCost).toBeGreaterThan(0);
      expect(data.panels).toBe(1);
    });
  });

  test('chain-link heights have fabric data', () => {
    heights.forEach(h => {
      const data = BOM['chain-link'].heights[h];
      expect(data.fabricCost).toBeGreaterThan(0);
      expect(data.fabricLength).toBe(50);
      expect(data.topRailLength).toBe(21);
    });
  });
});

// =============================================================================
// calculateBOM - ALL FENCE TYPES x ALL HEIGHTS
// =============================================================================
describe('calculateBOM', () => {
  // --- Wood ---
  describe('wood fence', () => {
    test.each([4, 6, 8])('wood at %dft height - 100ft', (height) => {
      const bom = calculateBOM(100, 'wood', height);
      expect(bom).not.toBeNull();
      expect(bom.items.length).toBeGreaterThan(0);
      expect(bom.materialTotal).toBeGreaterThan(0);

      const postItem = bom.items.find(i => i.name.includes('posts'));
      expect(postItem).toBeDefined();
      // 100ft / 8ft spacing = 13 sections, 14 posts
      expect(postItem.qty).toBe(14);

      const railItem = bom.items.find(i => i.name.includes('rails'));
      const expectedRails = BOM.wood.heights[height].rails;
      expect(railItem.qty).toBe(13 * expectedRails);

      const picketItem = bom.items.find(i => i.name.includes('pickets'));
      expect(picketItem.qty).toBe(13 * 17);
    });

    test('wood 6ft - 0 feet returns all zeros', () => {
      const bom = calculateBOM(0, 'wood', 6);
      expect(bom).not.toBeNull();
      // 0 feet -> 0 sections, 1 post
      const postItem = bom.items.find(i => i.name.includes('posts'));
      expect(postItem.qty).toBe(1);
    });

    test('wood 6ft - 1 foot', () => {
      const bom = calculateBOM(1, 'wood', 6);
      // 1ft / 8ft spacing = ceil(0.125) = 1 section, 2 posts
      const postItem = bom.items.find(i => i.name.includes('posts'));
      expect(postItem.qty).toBe(2);
    });

    test('wood 6ft - screw box calculation', () => {
      const bom = calculateBOM(80, 'wood', 6);
      // 80ft / 8 = 10 sections, 11 posts
      // pickets = 10 * 17 = 170, rails = 10*3 = 30, brackets = 10*3*2 = 60
      // screws = 170*6 + 60*2 = 1020 + 120 = 1140, boxes = ceil(1140/100) = 12
      const screwItem = bom.items.find(i => i.name.includes('screws'));
      expect(screwItem.qty).toBe(12);
    });

    test('wood 4ft costs less than wood 8ft', () => {
      const bom4 = calculateBOM(100, 'wood', 4);
      const bom8 = calculateBOM(100, 'wood', 8);
      expect(bom4.materialTotal).toBeLessThan(bom8.materialTotal);
    });
  });

  // --- Vinyl ---
  describe('vinyl fence', () => {
    test.each([4, 6, 8])('vinyl at %dft height - 100ft', (height) => {
      const bom = calculateBOM(100, 'vinyl', height);
      expect(bom).not.toBeNull();
      expect(bom.items.length).toBeGreaterThan(0);
      expect(bom.materialTotal).toBeGreaterThan(0);

      const postItem = bom.items.find(i => i.name.includes('posts'));
      // 100/8 = 13 sections, 14 posts
      expect(postItem.qty).toBe(14);

      const panelItem = bom.items.find(i => i.name.includes('panel'));
      expect(panelItem.qty).toBe(13);
    });

    test('vinyl includes stiffeners', () => {
      const bom = calculateBOM(100, 'vinyl', 6);
      const stiffener = bom.items.find(i => i.name.includes('stiffener'));
      expect(stiffener).toBeDefined();
      expect(stiffener.qty).toBe(14); // same as posts
    });

    test('vinyl includes post caps', () => {
      const bom = calculateBOM(100, 'vinyl', 6);
      const caps = bom.items.find(i => i.name.includes('Post caps'));
      expect(caps).toBeDefined();
      expect(caps.qty).toBe(14);
    });
  });

  // --- Chain-link ---
  describe('chain-link fence', () => {
    test.each([4, 6, 8])('chain-link at %dft height - 100ft', (height) => {
      const bom = calculateBOM(100, 'chain-link', height);
      expect(bom).not.toBeNull();
      expect(bom.items.length).toBeGreaterThan(0);
      expect(bom.materialTotal).toBeGreaterThan(0);

      // 100/10 = 10 sections, 11 posts
      const fabricItem = bom.items.find(i => i.name.includes('mesh'));
      expect(fabricItem.qty).toBe(Math.ceil(100 / 50)); // 2 rolls
    });

    test('chain-link terminal and line post split (2 points, straight)', () => {
      const bom = calculateBOM(100, 'chain-link', 6, { fencePointCount: 2 });
      // corners = max(0, 2-2) = 0, terminals = 2+0 = 2, total posts = 11
      // linePosts = 11 - 2 = 9
      const lineItem = bom.items.find(i => i.name.includes('line post'));
      const termItem = bom.items.find(i => i.name.includes('terminal post'));
      expect(lineItem.qty).toBe(9);
      expect(termItem.qty).toBe(2);
    });

    test('chain-link with corners (4 points)', () => {
      const bom = calculateBOM(100, 'chain-link', 6, { fencePointCount: 4 });
      // corners = max(0, 4-2) = 2, terminals = 2+2 = 4, total posts = 11
      // linePosts = 11 - 4 = 7
      const lineItem = bom.items.find(i => i.name.includes('line post'));
      const termItem = bom.items.find(i => i.name.includes('terminal post'));
      expect(lineItem.qty).toBe(7);
      expect(termItem.qty).toBe(4);
    });

    test('chain-link closed fence (all corners are terminals)', () => {
      const bom = calculateBOM(100, 'chain-link', 6, { fenceClosed: true, fencePointCount: 4 });
      // corners = 4 (closed), terminals = 2+4 = 6, total posts = 11
      // linePosts = max(0, 11-6) = 5
      const termItem = bom.items.find(i => i.name.includes('terminal post'));
      expect(termItem.qty).toBe(6);
    });

    test('chain-link top rail calculation', () => {
      const bom = calculateBOM(100, 'chain-link', 6);
      const topRail = bom.items.find(i => i.name.includes('top rail'));
      expect(topRail.qty).toBe(Math.ceil(100 / 21)); // 5
    });

    test('chain-link hardware items present', () => {
      const bom = calculateBOM(100, 'chain-link', 6);
      expect(bom.items.find(i => i.name.includes('Tension bars'))).toBeDefined();
      expect(bom.items.find(i => i.name.includes('Tension bands'))).toBeDefined();
      expect(bom.items.find(i => i.name.includes('Brace bands'))).toBeDefined();
      expect(bom.items.find(i => i.name.includes('Rail end'))).toBeDefined();
      expect(bom.items.find(i => i.name.includes('Loop caps'))).toBeDefined();
      expect(bom.items.find(i => i.name.includes('Dome caps'))).toBeDefined();
      expect(bom.items.find(i => i.name.includes('carriage bolts'))).toBeDefined();
      expect(bom.items.find(i => i.name.includes('Tie wires'))).toBeDefined();
      expect(bom.items.find(i => i.name.includes('concrete'))).toBeDefined();
    });
  });

  // --- Aluminum ---
  describe('aluminum fence', () => {
    test.each([4, 6, 8])('aluminum at %dft height - 100ft', (height) => {
      const bom = calculateBOM(100, 'aluminum', height);
      expect(bom).not.toBeNull();
      expect(bom.items.length).toBeGreaterThan(0);
      expect(bom.materialTotal).toBeGreaterThan(0);

      // 100/6 = 17 sections, 18 posts (aluminum spacing is 6)
      const postItem = bom.items.find(i => i.name.includes('posts'));
      expect(postItem.qty).toBe(18);

      const panelItem = bom.items.find(i => i.name.includes('panel'));
      expect(panelItem.qty).toBe(17);
    });

    test('aluminum bracket count', () => {
      const bom = calculateBOM(100, 'aluminum', 6);
      // sections = 17, brackets = 17 * 4 = 68
      const brackets = bom.items.find(i => i.name.includes('brackets'));
      expect(brackets.qty).toBe(68);
    });

    test('aluminum screw count includes bracket screws', () => {
      const bom = calculateBOM(100, 'aluminum', 6);
      // sections = 17, screws = 17*4 + 68 = 68+68 = 136
      const screws = bom.items.find(i => i.name.includes('screws'));
      expect(screws.qty).toBe(136);
    });
  });

  // --- Iron ---
  describe('iron fence', () => {
    test.each([4, 6, 8])('iron at %dft height - 100ft', (height) => {
      const bom = calculateBOM(100, 'iron', height);
      expect(bom).not.toBeNull();
      expect(bom.items.length).toBeGreaterThan(0);
      expect(bom.materialTotal).toBeGreaterThan(0);

      // 100/8 = 13 sections, 14 posts (iron spacing is 8)
      const postItem = bom.items.find(i => i.name.includes('posts'));
      expect(postItem.qty).toBe(14);

      const panelItem = bom.items.find(i => i.name.includes('panel'));
      expect(panelItem.qty).toBe(13);
    });

    test('iron bolt count includes bracket bolts', () => {
      const bom = calculateBOM(100, 'iron', 6);
      // sections = 13, brackets = 13*4 = 52, screws = 13*10 + 52*2 = 130+104 = 234
      const bolts = bom.items.find(i => i.name.includes('Bolts'));
      expect(bolts.qty).toBe(234);
    });

    test('iron is more expensive than aluminum at same height', () => {
      const bomIron = calculateBOM(100, 'iron', 6);
      const bomAlum = calculateBOM(100, 'aluminum', 6);
      expect(bomIron.materialTotal).toBeGreaterThan(bomAlum.materialTotal);
    });
  });

  // --- Edge cases ---
  describe('edge cases', () => {
    test('returns null for unknown fence type', () => {
      expect(calculateBOM(100, 'bamboo', 6)).toBeNull();
    });

    test('returns null for unsupported height', () => {
      expect(calculateBOM(100, 'wood', 10)).toBeNull();
    });

    test('handles very large footage', () => {
      const bom = calculateBOM(10000, 'wood', 6);
      expect(bom).not.toBeNull();
      expect(bom.materialTotal).toBeGreaterThan(0);
    });

    test('all items have total calculated', () => {
      const bom = calculateBOM(100, 'wood', 6);
      bom.items.forEach(item => {
        expect(item.total).toBeDefined();
        expect(item.total).toBe(Math.round(item.qty * item.unitCost * 100) / 100);
      });
    });

    test('materialTotal equals sum of item totals', () => {
      const bom = calculateBOM(100, 'vinyl', 6);
      const sum = bom.items.reduce((s, i) => s + i.total, 0);
      expect(bom.materialTotal).toBe(Math.round(sum));
    });

    test('zero-qty items are filtered out', () => {
      // With 0 feet, sections=0 so most items are 0 qty, only post (1) remains
      const bom = calculateBOM(0, 'wood', 6);
      bom.items.forEach(item => {
        expect(item.qty).toBeGreaterThan(0);
      });
    });
  });

  // --- Custom pricing ---
  describe('custom pricing overrides', () => {
    test('overrides height-specific pricing', () => {
      const bom = calculateBOM(100, 'wood', 6, {
        customPricing: { 'wood.6.postCost': 20 }
      });
      const postItem = bom.items.find(i => i.name.includes('posts'));
      expect(postItem.unitCost).toBe(20);
    });

    test('overrides extras pricing', () => {
      const bom = calculateBOM(100, 'wood', 6, {
        customPricing: { 'wood.extra.concreteBagCost': 10 }
      });
      const concrete = bom.items.find(i => i.name.includes('concrete'));
      expect(concrete.unitCost).toBe(10);
    });

    test('uses fallback when no custom pricing set', () => {
      const bom = calculateBOM(100, 'wood', 6, { customPricing: {} });
      const postItem = bom.items.find(i => i.name.includes('posts'));
      expect(postItem.unitCost).toBe(16); // default
    });

    test('custom pricing changes materialTotal', () => {
      const bomDefault = calculateBOM(100, 'wood', 6);
      const bomCustom = calculateBOM(100, 'wood', 6, {
        customPricing: { 'wood.6.postCost': 100 }
      });
      expect(bomCustom.materialTotal).toBeGreaterThan(bomDefault.materialTotal);
    });

    test('chain-link custom pricing', () => {
      const bom = calculateBOM(100, 'chain-link', 6, {
        customPricing: { 'chain-link.6.fabricCost': 200 }
      });
      const fabric = bom.items.find(i => i.name.includes('mesh'));
      expect(fabric.unitCost).toBe(200);
    });
  });
});

// =============================================================================
// Catmull-Rom spline
// =============================================================================
describe('catmullRom', () => {
  const p0 = { lat: 0, lng: 0 };
  const p1 = { lat: 1, lng: 0 };
  const p2 = { lat: 1, lng: 1 };
  const p3 = { lat: 0, lng: 1 };

  test('returns p1 at t=0', () => {
    const result = catmullRom(p0, p1, p2, p3, 0);
    expect(result.lat).toBeCloseTo(1, 10);
    expect(result.lng).toBeCloseTo(0, 10);
  });

  test('returns p2 at t=1', () => {
    const result = catmullRom(p0, p1, p2, p3, 1);
    expect(result.lat).toBeCloseTo(1, 10);
    expect(result.lng).toBeCloseTo(1, 10);
  });

  test('returns midpoint near t=0.5', () => {
    const result = catmullRom(p0, p1, p2, p3, 0.5);
    // Should be between p1 and p2 lat/lng wise
    expect(result.lat).toBeGreaterThanOrEqual(0);
    expect(result.lat).toBeLessThanOrEqual(2);
    expect(result.lng).toBeGreaterThanOrEqual(-1);
    expect(result.lng).toBeLessThanOrEqual(2);
  });

  test('all collinear points produce linear interpolation', () => {
    const a = { lat: 0, lng: 0 };
    const b = { lat: 1, lng: 1 };
    const c = { lat: 2, lng: 2 };
    const d = { lat: 3, lng: 3 };
    const mid = catmullRom(a, b, c, d, 0.5);
    expect(mid.lat).toBeCloseTo(1.5, 5);
    expect(mid.lng).toBeCloseTo(1.5, 5);
  });
});

// =============================================================================
// getSplinePoints
// =============================================================================
describe('getSplinePoints', () => {
  test('returns input if fewer than 3 points', () => {
    const pts = [{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }];
    const result = getSplinePoints(pts, false);
    expect(result).toEqual(pts);
  });

  test('generates more points than input for 3+ points', () => {
    const pts = [
      { lat: 0, lng: 0 },
      { lat: 1, lng: 0 },
      { lat: 1, lng: 1 }
    ];
    const result = getSplinePoints(pts, false);
    expect(result.length).toBeGreaterThan(pts.length);
  });

  test('open spline ends at last point', () => {
    const pts = [
      { lat: 0, lng: 0 },
      { lat: 1, lng: 0 },
      { lat: 1, lng: 1 }
    ];
    const result = getSplinePoints(pts, false);
    const last = result[result.length - 1];
    expect(last.lat).toBeCloseTo(1, 5);
    expect(last.lng).toBeCloseTo(1, 5);
  });

  test('closed spline generates points for wrapping', () => {
    const pts = [
      { lat: 0, lng: 0 },
      { lat: 1, lng: 0 },
      { lat: 1, lng: 1 },
      { lat: 0, lng: 1 }
    ];
    const open = getSplinePoints(pts, false);
    const closed = getSplinePoints(pts, true);
    expect(closed.length).toBeGreaterThan(open.length);
  });

  test('each segment produces 12 interpolated points', () => {
    const pts = [
      { lat: 0, lng: 0 },
      { lat: 1, lng: 0 },
      { lat: 2, lng: 0 }
    ];
    const result = getSplinePoints(pts, false);
    // 2 segments * 12 + 1 final = 25
    expect(result.length).toBe(25);
  });
});

// =============================================================================
// calculateFootage (with Haversine)
// =============================================================================
describe('calculateFootage', () => {
  // Richmond VA area points ~100m apart
  const p1 = { lat: 37.6068, lng: -77.3732 };
  const p2 = { lat: 37.6077, lng: -77.3732 }; // ~100m north

  test('returns 0 for single point', () => {
    expect(calculateFootage([p1], false, false)).toBe(0);
  });

  test('returns 0 for empty array', () => {
    expect(calculateFootage([], false, false)).toBe(0);
  });

  test('calculates straight line distance', () => {
    const feet = calculateFootage([p1, p2], false, false);
    expect(feet).toBeGreaterThan(200);
    expect(feet).toBeLessThan(400);
  });

  test('closed loop adds return segment', () => {
    const p3 = { lat: 37.6068, lng: -77.3723 };
    const openFeet = calculateFootage([p1, p2, p3], false, false);
    const closedFeet = calculateFootage([p1, p2, p3], true, false);
    expect(closedFeet).toBeGreaterThan(openFeet);
  });

  test('curve mode changes footage for 3+ points', () => {
    const p3 = { lat: 37.6068, lng: -77.3723 };
    const straightFeet = calculateFootage([p1, p2, p3], false, false);
    const curveFeet = calculateFootage([p1, p2, p3], false, true);
    // Curve should differ from straight (may be more or less depending on shape)
    expect(curveFeet).not.toBe(straightFeet);
  });

  test('two points with curve mode uses straight calculation', () => {
    // Curve mode needs 3+ points, so with 2 it falls back to straight
    const feet = calculateFootage([p1, p2], false, true);
    const feetStraight = calculateFootage([p1, p2], false, false);
    expect(feet).toBe(feetStraight);
  });
});

// =============================================================================
// distBetween (Haversine)
// =============================================================================
describe('distBetween', () => {
  test('same point returns 0', () => {
    const p = { lat: 37.6068, lng: -77.3732 };
    expect(distBetween(p, p)).toBe(0);
  });

  test('known distance approximately correct', () => {
    // ~1 degree latitude ~ 111km
    const p1 = { lat: 37.0, lng: -77.0 };
    const p2 = { lat: 38.0, lng: -77.0 };
    const dist = distBetween(p1, p2);
    expect(dist).toBeGreaterThan(110000);
    expect(dist).toBeLessThan(112000);
  });

  test('returns positive for any two different points', () => {
    const p1 = { lat: 0, lng: 0 };
    const p2 = { lat: 0.001, lng: 0.001 };
    expect(distBetween(p1, p2)).toBeGreaterThan(0);
  });
});

// =============================================================================
// getPrice
// =============================================================================
describe('getPrice', () => {
  test('returns fallback when no custom pricing', () => {
    expect(getPrice('wood', 6, 'postCost', 14, {})).toBe(14);
  });

  test('returns fallback when customPricing is undefined', () => {
    expect(getPrice('wood', 6, 'postCost', 14, undefined)).toBe(14);
  });

  test('returns custom price when set', () => {
    const pricing = { 'wood.6.postCost': 20 };
    expect(getPrice('wood', 6, 'postCost', 14, pricing)).toBe(20);
  });

  test('returns custom price even if 0', () => {
    const pricing = { 'wood.6.postCost': 0 };
    expect(getPrice('wood', 6, 'postCost', 14, pricing)).toBe(0);
  });
});

// =============================================================================
// Share URL encoding/decoding
// =============================================================================
describe('encodeEstimate / decodeEstimate', () => {
  test('round-trip preserves data', () => {
    const data = {
      p: [[37.6068, -77.3732], [37.6077, -77.3732]],
      f: 'wood',
      h: 6,
      t: 1.15,
      c: 1,
      cv: 0,
      g: [{ t: 'single', lt: 37.6070, ln: -77.3730 }],
      a: [1, 0, 1],
      n: 'John Doe',
      ph: '555-1234',
      ad: '123 Main St',
      ci: [{ nm: 'Gravel', q: 5, uc: 10 }]
    };

    const encoded = encodeEstimate(data);
    expect(typeof encoded).toBe('string');
    expect(encoded.length).toBeGreaterThan(0);

    const decoded = decodeEstimate(encoded);
    expect(decoded).toEqual(data);
  });

  test('handles empty data', () => {
    const data = {};
    const encoded = encodeEstimate(data);
    const decoded = decodeEstimate(encoded);
    expect(decoded).toEqual({});
  });

  test('handles special characters in names', () => {
    const data = { n: 'O\'Brien & Sons "LLC"', ad: '123 Main St, Apt #5' };
    const decoded = decodeEstimate(encodeEstimate(data));
    expect(decoded.n).toBe(data.n);
    expect(decoded.ad).toBe(data.ad);
  });

  test('handles unicode', () => {
    const data = { n: 'Jose Garcia' };
    const decoded = decodeEstimate(encodeEstimate(data));
    expect(decoded.n).toBe(data.n);
  });
});

// =============================================================================
// customItemsTotal
// =============================================================================
describe('customItemsTotal', () => {
  test('returns 0 for empty array', () => {
    expect(customItemsTotal([])).toBe(0);
  });

  test('sums single item', () => {
    expect(customItemsTotal([{ qty: 3, unitCost: 10 }])).toBe(30);
  });

  test('sums multiple items', () => {
    const items = [
      { qty: 2, unitCost: 15 },
      { qty: 5, unitCost: 8 },
      { qty: 1, unitCost: 100 }
    ];
    expect(customItemsTotal(items)).toBe(30 + 40 + 100);
  });

  test('handles zero quantities', () => {
    expect(customItemsTotal([{ qty: 0, unitCost: 50 }])).toBe(0);
  });

  test('handles zero costs', () => {
    expect(customItemsTotal([{ qty: 10, unitCost: 0 }])).toBe(0);
  });

  test('handles decimal values', () => {
    const total = customItemsTotal([{ qty: 3, unitCost: 7.50 }]);
    expect(total).toBeCloseTo(22.50, 2);
  });
});

// =============================================================================
// Cross-type comparisons (sanity checks)
// =============================================================================
describe('cross-type BOM comparisons', () => {
  test('all fence types produce valid BOM for 100ft at 6ft', () => {
    ['wood', 'vinyl', 'chain-link', 'aluminum', 'iron'].forEach(type => {
      const bom = calculateBOM(100, type, 6);
      expect(bom).not.toBeNull();
      expect(bom.materialTotal).toBeGreaterThan(0);
      expect(bom.items.length).toBeGreaterThanOrEqual(3);
    });
  });

  test('every BOM item has required fields', () => {
    ['wood', 'vinyl', 'chain-link', 'aluminum', 'iron'].forEach(type => {
      [4, 6, 8].forEach(height => {
        const bom = calculateBOM(100, type, height);
        bom.items.forEach(item => {
          expect(item).toHaveProperty('name');
          expect(item).toHaveProperty('qty');
          expect(item).toHaveProperty('unit');
          expect(item).toHaveProperty('unitCost');
          expect(item).toHaveProperty('total');
          expect(typeof item.name).toBe('string');
          expect(typeof item.qty).toBe('number');
          expect(typeof item.unitCost).toBe('number');
        });
      });
    });
  });
});
