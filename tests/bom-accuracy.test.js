/**
 * BOM Accuracy Tests — Real-World Scenarios
 *
 * These tests verify that the BOM output matches what a contractor would
 * actually order from a supplier for common fence jobs. Each scenario is
 * based on industry-standard post spacing, material counts, and hardware.
 *
 * If a test fails, it means the estimate would be wrong on a real bid.
 */
const {
  calculateBOM,
  calculateMulchBOM,
  calculateFootage,
  calculatePolygonArea,
  distBetween
} = require('../client/preview/js/bom');

// ============================================================================
// REAL-WORLD FENCE SCENARIOS
// ============================================================================
describe('real-world fence scenarios', () => {

  // ---- Wood Privacy Fence ----
  describe('wood privacy fence — typical backyard', () => {
    // 150ft perimeter, 6ft tall, standard privacy fence
    const bom = calculateBOM(150, 'wood', 6);
    const items = name => bom.items.find(i => i.name.includes(name));

    test('post count: 150ft / 8ft spacing = 19 sections + 1 = 20 posts', () => {
      expect(items('posts').qty).toBe(20);
    });

    test('3 horizontal rails per section for 6ft fence = 57 rails', () => {
      expect(items('rails').qty).toBe(19 * 3);
    });

    test('17 pickets per 8ft section = 323 pickets', () => {
      expect(items('pickets').qty).toBe(19 * 17);
    });

    test('2 concrete bags per post = 40 bags', () => {
      expect(items('concrete').qty).toBe(20 * 2);
    });

    test('bracket count: 3 per section × 2 sides × 19 sections = 114', () => {
      expect(items('brackets').qty).toBe(19 * 3 * 2);
    });

    test('total material cost is in a reasonable range for 150ft wood', () => {
      // Industry rough range: $8-20/ft for materials only
      const perFoot = bom.materialTotal / 150;
      expect(perFoot).toBeGreaterThan(7);
      expect(perFoot).toBeLessThan(25);
    });

    test('screw boxes cover all picket and bracket screws', () => {
      const picketScrews = 19 * 17 * 6; // 6 screws per picket for 6ft
      const bracketScrews = 19 * 3 * 2 * 2; // brackets × 2 screws each
      const totalScrews = picketScrews + bracketScrews;
      const expectedBoxes = Math.ceil(totalScrews / 100);
      expect(items('screws').qty).toBe(expectedBoxes);
    });
  });

  // ---- Short Decorative Wood Fence ----
  describe('wood 4ft fence — front yard decorative', () => {
    const bom = calculateBOM(60, 'wood', 4);
    const items = name => bom.items.find(i => i.name.includes(name));

    test('2 rails per section for 4ft fence', () => {
      // 60/8 = 8 sections (ceil 7.5)
      const sections = Math.ceil(60 / 8);
      expect(items('rails').qty).toBe(sections * 2);
    });

    test('shorter posts (4x4x6) are cheaper than 6ft fence posts', () => {
      expect(items('posts').unitCost).toBe(12); // 4x4x6 PT
    });

    test('4ft pickets cost less than 6ft pickets', () => {
      expect(items('pickets').unitCost).toBe(2.25);
    });
  });

  // ---- Tall Wood Privacy Fence ----
  describe('wood 8ft fence — max privacy', () => {
    const bom = calculateBOM(100, 'wood', 8);
    const items = name => bom.items.find(i => i.name.includes(name));

    test('uses 6x6 posts for 8ft height (not 4x4)', () => {
      expect(items('posts').name).toContain('6x6');
    });

    test('4 rails per section for 8ft fence', () => {
      const sections = Math.ceil(100 / 8); // 13
      expect(items('rails').qty).toBe(sections * 4);
    });

    test('4 concrete bags per post for 8ft (deeper holes)', () => {
      const posts = Math.ceil(100 / 8) + 1; // 14
      expect(items('concrete').qty).toBe(posts * 4);
    });
  });

  // ---- Vinyl Privacy Fence ----
  describe('vinyl fence — 200ft property line', () => {
    const bom = calculateBOM(200, 'vinyl', 6);
    const items = name => bom.items.find(i => i.name.includes(name));

    test('panel count matches section count (1 panel per 8ft section)', () => {
      const sections = Math.ceil(200 / 8); // 25
      expect(items('panel').qty).toBe(sections);
    });

    test('every post gets a stiffener', () => {
      const posts = Math.ceil(200 / 8) + 1; // 26
      expect(items('stiffener').qty).toBe(posts);
    });

    test('every post gets a cap', () => {
      const posts = Math.ceil(200 / 8) + 1;
      expect(items('Post caps').qty).toBe(posts);
    });

    test('vinyl is more expensive per foot than wood at same height', () => {
      const vinylPerFt = bom.materialTotal / 200;
      const woodBom = calculateBOM(200, 'wood', 6);
      const woodPerFt = woodBom.materialTotal / 200;
      expect(vinylPerFt).toBeGreaterThan(woodPerFt);
    });
  });

  // ---- Chain-Link with Corners ----
  describe('chain-link — 200ft with 4 corners (rectangular yard)', () => {
    const bom = calculateBOM(200, 'chain-link', 6, {
      fencePointCount: 6, // 4 corners + 2 endpoints
      fenceClosed: false
    });
    const items = name => bom.items.find(i => i.name.includes(name));

    test('terminal posts at ends + corners', () => {
      // 6 points, not closed: corners = max(0, 6-2) = 4, terminals = 2+4 = 6
      expect(items('terminal post').qty).toBe(6);
    });

    test('line posts fill the gaps between terminals', () => {
      const totalPosts = Math.ceil(200 / 10) + 1; // 21
      const terminals = 6;
      expect(items('line post').qty).toBe(totalPosts - terminals);
    });

    test('fabric rolls cover total length (50ft rolls)', () => {
      expect(items('mesh').qty).toBe(Math.ceil(200 / 50)); // 4 rolls
    });

    test('top rail count (21ft rails)', () => {
      expect(items('top rail').qty).toBe(Math.ceil(200 / 21)); // 10
    });

    test('tension bars = 1 per terminal', () => {
      expect(items('Tension bars').qty).toBe(6);
    });

    test('tension bands = 5 per terminal for 6ft', () => {
      expect(items('Tension bands').qty).toBe(6 * 5);
    });

    test('dome caps on terminals, loop caps on line posts', () => {
      expect(items('Dome caps').qty).toBe(6);
      expect(items('Loop caps').qty).toBe(21 - 6); // 15
    });
  });

  // ---- Chain-Link Closed Loop ----
  describe('chain-link — closed rectangular fence', () => {
    const bom = calculateBOM(160, 'chain-link', 4, {
      fencePointCount: 4,
      fenceClosed: true
    });
    const items = name => bom.items.find(i => i.name.includes(name));

    test('all fence points become terminals when closed', () => {
      // Closed: corners = fencePointCount = 4, terminals = 2+4 = 6
      expect(items('terminal post').qty).toBe(6);
    });

    test('chain-link 4ft uses cheaper/shorter posts', () => {
      expect(items('line post').unitCost).toBe(16);
      expect(items('terminal post').unitCost).toBe(22);
    });
  });

  // ---- Aluminum Ornamental ----
  describe('aluminum fence — 120ft front yard', () => {
    const bom = calculateBOM(120, 'aluminum', 4);
    const items = name => bom.items.find(i => i.name.includes(name));

    test('6ft panel spacing = more posts per linear foot than wood', () => {
      const posts = Math.ceil(120 / 6) + 1; // 21
      expect(items('posts').qty).toBe(posts);
    });

    test('panel count = section count', () => {
      expect(items('panel').qty).toBe(Math.ceil(120 / 6)); // 20
    });

    test('4 mounting brackets per panel', () => {
      const sections = Math.ceil(120 / 6);
      expect(items('brackets').qty).toBe(sections * 4);
    });

    test('only 1 concrete bag per post for 4ft aluminum', () => {
      const posts = Math.ceil(120 / 6) + 1;
      expect(items('concrete').qty).toBe(posts * 1);
    });
  });

  // ---- Wrought Iron ----
  describe('iron fence — 80ft estate perimeter', () => {
    const bom = calculateBOM(80, 'iron', 6);
    const items = name => bom.items.find(i => i.name.includes(name));

    test('iron is the most expensive fence type per foot', () => {
      const types = ['wood', 'vinyl', 'chain-link', 'aluminum'];
      types.forEach(type => {
        const other = calculateBOM(80, type, 6);
        expect(bom.materialTotal).toBeGreaterThan(other.materialTotal);
      });
    });

    test('uses heavier 2.5x2.5 posts for 6ft iron', () => {
      expect(items('posts').name).toContain('2.5x2.5');
    });

    test('3 concrete bags per post for iron 6ft', () => {
      const posts = Math.ceil(80 / 8) + 1; // 11
      expect(items('concrete').qty).toBe(posts * 3);
    });
  });
});

// ============================================================================
// REAL-WORLD MULCH SCENARIOS
// ============================================================================
describe('real-world mulch scenarios', () => {

  describe('typical flower bed — 300 sq ft, 3" hardwood bags', () => {
    const bom = calculateMulchBOM(300, 'hardwood', 3);

    test('cubic feet: 300 × 3/12 = 75', () => {
      expect(bom.cubicYards).toBe(Math.ceil((75 / 27) * 10) / 10); // 2.8
    });

    test('bag count: 75 cu ft / 2 cu ft per bag = 38 bags', () => {
      expect(bom.items[0].qty).toBe(38);
    });

    test('cost in realistic range ($150-200 for bags)', () => {
      expect(bom.materialTotal).toBeGreaterThan(100);
      expect(bom.materialTotal).toBeLessThan(250);
    });
  });

  describe('large landscape — 2000 sq ft, 3" cedar bulk', () => {
    const bom = calculateMulchBOM(2000, 'cedar', 3, { deliveryMode: 'bulk' });

    test('cubic yards: 2000 × 3/12 / 27 = 18.5, rounds to 18.5', () => {
      expect(bom.cubicYards).toBe(18.5);
    });

    test('bulk is cheaper than bags for large areas', () => {
      const bagBom = calculateMulchBOM(2000, 'cedar', 3, { deliveryMode: 'bags' });
      expect(bom.materialTotal).toBeLessThan(bagBom.materialTotal);
    });
  });

  describe('playground rubber mulch — 400 sq ft, 4" depth', () => {
    const bom = calculateMulchBOM(400, 'rubber', 4);

    test('smaller bag size (0.8 cu ft) means more bags needed', () => {
      // 400 * 4/12 = 133.33 cu ft / 0.8 = 167 bags
      expect(bom.items[0].qty).toBe(167);
    });

    test('rubber mulch is significantly more expensive', () => {
      const hardwood = calculateMulchBOM(400, 'hardwood', 4);
      expect(bom.materialTotal).toBeGreaterThan(hardwood.materialTotal * 2);
    });
  });

  describe('mulch with full accessories', () => {
    const bom = calculateMulchBOM(500, 'hardwood', 3, {
      addFabric: true,
      addEdging: true,
      perimeterFt: 90
    });

    test('landscape fabric rolls: 500/150 = 4 rolls', () => {
      const fabric = bom.items.find(i => i.name.includes('fabric'));
      expect(fabric.qty).toBe(4);
    });

    test('fabric staples: 500/2 = 250 staples, 250/75 = 4 packs', () => {
      const staples = bom.items.find(i => i.name.includes('staples'));
      expect(staples.qty).toBe(4);
    });

    test('edging sections: 90/20 = 5 sections', () => {
      const edging = bom.items.find(i => i.name.includes('edging'));
      expect(edging.qty).toBe(5);
    });

    test('edging stakes: 90/3 = 30 stakes', () => {
      const stakes = bom.items.find(i => i.name.includes('stakes'));
      expect(stakes.qty).toBe(30);
    });

    test('total includes mulch + fabric + edging', () => {
      const mulchOnly = calculateMulchBOM(500, 'hardwood', 3);
      expect(bom.materialTotal).toBeGreaterThan(mulchOnly.materialTotal);
    });
  });
});

// ============================================================================
// MEASUREMENT ACCURACY — KNOWN DISTANCES
// ============================================================================
describe('measurement accuracy — known GPS distances', () => {

  test('100 meters (known lat offset) = ~328 feet', () => {
    // 100 meters = 0.000899 degrees latitude
    const p1 = { lat: 37.5400, lng: -77.4360 };
    const p2 = { lat: 37.5409, lng: -77.4360 }; // ~100m north
    const meters = distBetween(p1, p2);
    expect(meters).toBeGreaterThan(95);
    expect(meters).toBeLessThan(105);
    const feet = calculateFootage([p1, p2], false, false);
    expect(feet).toBeGreaterThan(310);
    expect(feet).toBeLessThan(345);
  });

  test('50ft fence segment = ~15.24m', () => {
    // 15.24m at Richmond VA latitude
    const metersPerDegLat = 111320;
    const offset = 15.24 / metersPerDegLat;
    const p1 = { lat: 37.5400, lng: -77.4360 };
    const p2 = { lat: 37.5400 + offset, lng: -77.4360 };
    const feet = calculateFootage([p1, p2], false, false);
    expect(feet).toBeGreaterThan(45);
    expect(feet).toBeLessThan(55);
  });

  test('rectangular yard ~50x30m matches expected perimeter', () => {
    const lat = 37.5400;
    const lng = -77.4360;
    const dLat = 50 / 111320;
    const dLng = 30 / (111320 * Math.cos(lat * Math.PI / 180));
    const points = [
      { lat, lng },
      { lat: lat + dLat, lng },
      { lat: lat + dLat, lng: lng + dLng },
      { lat, lng: lng + dLng }
    ];
    const feet = calculateFootage(points, true, false);
    // Perimeter = 2*(50+30) = 160m = ~525ft
    expect(feet).toBeGreaterThan(500);
    expect(feet).toBeLessThan(550);
  });

  test('polygon area for ~10m x 10m square = ~1076 sq ft', () => {
    const lat = 37.5400;
    const lng = -77.4360;
    const dLat = 10 / 111320;
    const dLng = 10 / (111320 * Math.cos(lat * Math.PI / 180));
    const points = [
      { lat, lng },
      { lat: lat + dLat, lng },
      { lat: lat + dLat, lng: lng + dLng },
      { lat, lng: lng + dLng }
    ];
    const area = calculatePolygonArea(points);
    // 100 sq meters = 1076.4 sq ft
    expect(area).toBeGreaterThan(1000);
    expect(area).toBeLessThan(1150);
  });
});

// ============================================================================
// COST SANITY CHECKS — per-foot ranges from industry data
// ============================================================================
describe('per-foot material cost sanity checks', () => {
  const lengths = [50, 100, 200, 500];

  test.each(lengths)('wood 6ft at %dft stays in $8-20/ft range', (ft) => {
    const bom = calculateBOM(ft, 'wood', 6);
    const perFoot = bom.materialTotal / ft;
    expect(perFoot).toBeGreaterThan(7);
    expect(perFoot).toBeLessThan(22);
  });

  test.each(lengths)('vinyl 6ft at %dft stays in $12-30/ft range', (ft) => {
    const bom = calculateBOM(ft, 'vinyl', 6);
    const perFoot = bom.materialTotal / ft;
    expect(perFoot).toBeGreaterThan(10);
    expect(perFoot).toBeLessThan(35);
  });

  test.each(lengths)('chain-link 6ft at %dft stays in $5-20/ft range', (ft) => {
    const bom = calculateBOM(ft, 'chain-link', 6);
    const perFoot = bom.materialTotal / ft;
    expect(perFoot).toBeGreaterThan(4);
    expect(perFoot).toBeLessThan(25);
  });

  test.each(lengths)('aluminum 4ft at %dft stays in $15-35/ft range', (ft) => {
    const bom = calculateBOM(ft, 'aluminum', 4);
    const perFoot = bom.materialTotal / ft;
    expect(perFoot).toBeGreaterThan(12);
    expect(perFoot).toBeLessThan(40);
  });

  test.each(lengths)('iron 6ft at %dft stays in $35-70/ft range', (ft) => {
    const bom = calculateBOM(ft, 'iron', 6);
    const perFoot = bom.materialTotal / ft;
    expect(perFoot).toBeGreaterThan(30);
    expect(perFoot).toBeLessThan(75);
  });

  test('taller fences always cost more per foot', () => {
    ['wood', 'vinyl', 'chain-link', 'aluminum', 'iron'].forEach(type => {
      const bom4 = calculateBOM(100, type, 4);
      const bom6 = calculateBOM(100, type, 6);
      const bom8 = calculateBOM(100, type, 8);
      expect(bom6.materialTotal).toBeGreaterThan(bom4.materialTotal);
      expect(bom8.materialTotal).toBeGreaterThan(bom6.materialTotal);
    });
  });

  test('longer fences have lower per-foot cost (quantity discount effect)', () => {
    // Fixed costs (end posts, etc.) get amortized over more footage
    ['wood', 'vinyl', 'aluminum', 'iron'].forEach(type => {
      const short = calculateBOM(20, type, 6);
      const long = calculateBOM(500, type, 6);
      const shortPerFt = short.materialTotal / 20;
      const longPerFt = long.materialTotal / 500;
      expect(longPerFt).toBeLessThanOrEqual(shortPerFt);
    });
  });
});
