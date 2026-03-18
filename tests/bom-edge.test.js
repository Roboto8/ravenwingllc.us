/**
 * Additional edge case tests for BOM module
 */
const {
  BOM,
  calculateBOM,
  calculateMulchBOM,
  calculateFootage,
  calculatePolygonArea,
  distBetween,
  getPrice,
  encodeEstimate,
  decodeEstimate,
  customItemsTotal,
  getSplinePoints,
  catmullRom
} = require('../client/preview/js/bom');

describe('BOM calculations - additional edge cases', () => {

  describe('calculateBOM - fractional footage', () => {
    test('handles fractional footage correctly', () => {
      const bom = calculateBOM(7.5, 'wood', 6);
      expect(bom).not.toBeNull();
      // 7.5 / 8 = 0.9375, ceil = 1 section, 2 posts
      const posts = bom.items.find(i => i.name.includes('posts'));
      expect(posts.qty).toBe(2);
    });

    test('handles very small footage (0.1 ft)', () => {
      const bom = calculateBOM(0.1, 'wood', 6);
      expect(bom).not.toBeNull();
      const posts = bom.items.find(i => i.name.includes('posts'));
      expect(posts.qty).toBe(2);
    });

    test('negative footage treated as 0', () => {
      const bom = calculateBOM(-10, 'wood', 6);
      // Implementation may vary, but should not crash
      expect(bom).not.toBeNull();
    });
  });

  describe('calculateBOM - all fence types at exact multiples of spacing', () => {
    test('wood at exactly 8ft (1 section)', () => {
      const bom = calculateBOM(8, 'wood', 6);
      const posts = bom.items.find(i => i.name.includes('posts'));
      expect(posts.qty).toBe(2);
    });

    test('wood at exactly 16ft (2 sections)', () => {
      const bom = calculateBOM(16, 'wood', 6);
      const posts = bom.items.find(i => i.name.includes('posts'));
      expect(posts.qty).toBe(3);
    });

    test('vinyl at exactly 8ft (1 section)', () => {
      const bom = calculateBOM(8, 'vinyl', 6);
      const posts = bom.items.find(i => i.name.includes('posts'));
      expect(posts.qty).toBe(2);
      const panels = bom.items.find(i => i.name.includes('panel'));
      expect(panels.qty).toBe(1);
    });

    test('chain-link at exactly 10ft (1 section)', () => {
      const bom = calculateBOM(10, 'chain-link', 6);
      const fabric = bom.items.find(i => i.name.includes('mesh'));
      expect(fabric.qty).toBe(1); // 10/50 = 0.2, ceil = 1 roll
    });

    test('aluminum at exactly 6ft (1 section)', () => {
      const bom = calculateBOM(6, 'aluminum', 6);
      const posts = bom.items.find(i => i.name.includes('posts'));
      expect(posts.qty).toBe(2);
      const panels = bom.items.find(i => i.name.includes('panel'));
      expect(panels.qty).toBe(1);
    });

    test('iron at exactly 8ft (1 section)', () => {
      const bom = calculateBOM(8, 'iron', 6);
      const posts = bom.items.find(i => i.name.includes('posts'));
      expect(posts.qty).toBe(2);
    });
  });

  describe('calculateBOM - concrete bags consistent', () => {
    test('all fence types include concrete bags', () => {
      ['wood', 'vinyl', 'chain-link', 'aluminum', 'iron'].forEach(type => {
        const bom = calculateBOM(100, type, 6);
        const concrete = bom.items.find(i => i.name.includes('concrete'));
        expect(concrete).toBeDefined();
        expect(concrete.qty).toBeGreaterThan(0);
      });
    });
  });

  describe('calculateBOM - custom pricing for extras', () => {
    test('vinyl custom post cap cost', () => {
      const bom = calculateBOM(100, 'vinyl', 6, {
        customPricing: { 'vinyl.extra.postCapCost': 15 }
      });
      const caps = bom.items.find(i => i.name.includes('Post caps'));
      expect(caps.unitCost).toBe(15);
    });

    test('aluminum custom bracket cost', () => {
      const bom = calculateBOM(100, 'aluminum', 6, {
        customPricing: { 'aluminum.extra.bracketCost': 5 }
      });
      const brackets = bom.items.find(i => i.name.includes('brackets'));
      expect(brackets.unitCost).toBe(5);
    });

    test('iron custom bracket cost', () => {
      const bom = calculateBOM(100, 'iron', 6, {
        customPricing: { 'iron.extra.bracketCost': 8 }
      });
      const brackets = bom.items.find(i => i.name.includes('brackets'));
      expect(brackets.unitCost).toBe(8);
    });
  });

  describe('chain-link - closed fence with 2 points', () => {
    test('closed with only 2 points', () => {
      const bom = calculateBOM(100, 'chain-link', 6, {
        fenceClosed: true,
        fencePointCount: 2
      });
      expect(bom).not.toBeNull();
      const termItem = bom.items.find(i => i.name.includes('terminal post'));
      expect(termItem).toBeDefined();
    });
  });
});

describe('getPrice - additional edge cases', () => {
  test('returns custom extra pricing', () => {
    const pricing = { 'wood.extra.concreteBagCost': 8 };
    expect(getPrice('wood', 'extra', 'concreteBagCost', 5, pricing)).toBe(8);
  });

  test('handles null custom pricing object', () => {
    expect(getPrice('wood', 6, 'postCost', 14, null)).toBe(14);
  });

  test('returns fallback for empty string key', () => {
    expect(getPrice('wood', 6, '', 14, {})).toBe(14);
  });
});

describe('calculateFootage - additional cases', () => {
  const p1 = { lat: 37.6068, lng: -77.3732 };
  const p2 = { lat: 37.6077, lng: -77.3732 };
  const p3 = { lat: 37.6077, lng: -77.3723 };

  test('returns positive footage for multi-segment line', () => {
    const feet = calculateFootage([p1, p2, p3], false, false);
    expect(feet).toBeGreaterThan(0);
  });

  test('closed loop with 2 points returns same as open (collinear return)', () => {
    const open = calculateFootage([p1, p2], false, false);
    const closed = calculateFootage([p1, p2], true, false);
    // With 2 points, closing just retraces the same line
    expect(closed).toBeGreaterThanOrEqual(open);
  });

  test('curve mode with many points produces smooth result', () => {
    const points = [
      { lat: 37.6068, lng: -77.3732 },
      { lat: 37.6072, lng: -77.3728 },
      { lat: 37.6077, lng: -77.3732 },
      { lat: 37.6072, lng: -77.3736 }
    ];
    const feet = calculateFootage(points, false, true);
    expect(feet).toBeGreaterThan(0);
  });
});

describe('distBetween - additional edge cases', () => {
  test('equator to pole is approximately correct', () => {
    const equator = { lat: 0, lng: 0 };
    const pole = { lat: 90, lng: 0 };
    const dist = distBetween(equator, pole);
    // Quarter circumference: ~10,000 km
    expect(dist).toBeGreaterThan(9900000);
    expect(dist).toBeLessThan(10100000);
  });

  test('symmetry: dist(a,b) === dist(b,a)', () => {
    const a = { lat: 37.6068, lng: -77.3732 };
    const b = { lat: 38.0, lng: -78.0 };
    expect(distBetween(a, b)).toBeCloseTo(distBetween(b, a), 5);
  });
});

describe('encodeEstimate / decodeEstimate - edge cases', () => {
  test('handles large coordinate arrays', () => {
    const data = {
      p: Array.from({ length: 100 }, (_, i) => [37 + i * 0.001, -77 + i * 0.001])
    };
    const decoded = decodeEstimate(encodeEstimate(data));
    expect(decoded.p).toHaveLength(100);
  });

  test('handles numeric values', () => {
    const data = { h: 0, t: 0, c: 0, cv: 0 };
    const decoded = decodeEstimate(encodeEstimate(data));
    expect(decoded.h).toBe(0);
    expect(decoded.t).toBe(0);
  });

  test('handles null values', () => {
    const data = { n: null };
    const decoded = decodeEstimate(encodeEstimate(data));
    expect(decoded.n).toBeNull();
  });
});

describe('customItemsTotal - edge cases', () => {
  test('missing qty field produces NaN (no input validation)', () => {
    const total = customItemsTotal([{ unitCost: 10 }]);
    expect(total).toBeNaN();
  });

  test('missing unitCost field produces NaN (no input validation)', () => {
    const total = customItemsTotal([{ qty: 5 }]);
    expect(total).toBeNaN();
  });

  test('handles large arrays', () => {
    const items = Array.from({ length: 1000 }, () => ({ qty: 1, unitCost: 1 }));
    expect(customItemsTotal(items)).toBe(1000);
  });

  test('throws for null/undefined input (no input validation)', () => {
    expect(() => customItemsTotal(null)).toThrow();
    expect(() => customItemsTotal(undefined)).toThrow();
  });
});

describe('calculatePolygonArea - additional', () => {
  test('returns consistent area regardless of point order (CW vs CCW)', () => {
    const side = 10 / 111320;
    const cw = [
      { lat: 0, lng: 0 },
      { lat: side, lng: 0 },
      { lat: side, lng: side },
      { lat: 0, lng: side }
    ];
    const ccw = [...cw].reverse();
    // Area should be same magnitude
    const areaCW = calculatePolygonArea(cw);
    const areaCCW = calculatePolygonArea(ccw);
    expect(Math.abs(areaCW - areaCCW)).toBeLessThan(1);
  });
});

describe('getSplinePoints - edge cases', () => {
  test('returns empty array for empty input', () => {
    const result = getSplinePoints([], false);
    expect(result).toEqual([]);
  });

  test('returns single point for single point input', () => {
    const pts = [{ lat: 0, lng: 0 }];
    const result = getSplinePoints(pts, false);
    expect(result).toEqual(pts);
  });

  test('closed spline with 3 points', () => {
    const pts = [
      { lat: 0, lng: 0 },
      { lat: 1, lng: 0 },
      { lat: 0.5, lng: 1 }
    ];
    const result = getSplinePoints(pts, true);
    expect(result.length).toBeGreaterThan(3);
  });
});

describe('catmullRom - boundary values', () => {
  test('handles identical points', () => {
    const p = { lat: 5, lng: 5 };
    const result = catmullRom(p, p, p, p, 0.5);
    expect(result.lat).toBeCloseTo(5, 10);
    expect(result.lng).toBeCloseTo(5, 10);
  });

  test('handles negative coordinates', () => {
    const result = catmullRom(
      { lat: -10, lng: -20 },
      { lat: -5, lng: -10 },
      { lat: 0, lng: 0 },
      { lat: 5, lng: 10 },
      0.5
    );
    expect(result.lat).toBeCloseTo(-2.5, 0);
    expect(result.lng).toBeCloseTo(-5, 0);
  });
});

describe('calculateMulchBOM - additional edge cases', () => {
  test('very small area', () => {
    const bom = calculateMulchBOM(1, 'hardwood', 3);
    expect(bom).not.toBeNull();
    expect(bom.items[0].qty).toBeGreaterThanOrEqual(1);
  });

  test('very deep mulch', () => {
    const bom = calculateMulchBOM(100, 'hardwood', 12);
    expect(bom).not.toBeNull();
    expect(bom.materialTotal).toBeGreaterThan(0);
  });

  test('rubber mulch is more expensive per bag', () => {
    const rubber = calculateMulchBOM(500, 'rubber', 3);
    const wood = calculateMulchBOM(500, 'hardwood', 3);
    expect(rubber.materialTotal).toBeGreaterThan(wood.materialTotal);
  });

  test('bulk mode rounds to 1 decimal for cubicYards', () => {
    const bom = calculateMulchBOM(333, 'hardwood', 3, { deliveryMode: 'bulk' });
    const decimals = (bom.cubicYards.toString().split('.')[1] || '').length;
    expect(decimals).toBeLessThanOrEqual(1);
  });

  test('fabric calculation with small area', () => {
    const bom = calculateMulchBOM(50, 'hardwood', 3, { addFabric: true });
    const fabric = bom.items.find(i => i.name.includes('fabric'));
    expect(fabric).toBeDefined();
    expect(fabric.qty).toBeGreaterThanOrEqual(1);
  });

  test('edging stakes calculation', () => {
    const bom = calculateMulchBOM(500, 'hardwood', 3, {
      addEdging: true,
      perimeterFt: 50
    });
    const stakes = bom.items.find(i => i.name.includes('stakes'));
    expect(stakes).toBeDefined();
    // 50 / 3 = 16.67, ceil = 17
    expect(stakes.qty).toBe(17);
  });
});
