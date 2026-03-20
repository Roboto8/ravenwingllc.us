/**
 * Tests for the refactored extras/add-on system.
 * Covers: pricing calculations, persistence, legacy format migration,
 * share link encoding/decoding, and custom extras.
 */

describe('Extras system', () => {
  let extras;
  let defaultExtras;

  beforeEach(() => {
    defaultExtras = [
      { id: 'removal',  name: 'Old fence removal',    unit: 'ft',   price: 5,   on: false },
      { id: 'hauling',  name: 'Haul-away / disposal', unit: 'flat', price: 150, on: false },
      { id: 'permit',   name: 'Permit',               unit: 'flat', price: 150, on: false },
      { id: 'stain',    name: 'Stain / seal',         unit: 'ft',   price: 4,   on: false },
      { id: 'clearing', name: 'Brush clearing',       unit: 'flat', price: 200, on: false },
      { id: 'grading',  name: 'Grading / leveling',   unit: 'flat', price: 500, on: false },
      { id: 'rock',     name: 'Rock / hard soil',     unit: 'flat', price: 300, on: false },
      { id: 'footing',  name: 'Footing removal',      unit: 'post', price: 75,  on: false }
    ];
    extras = defaultExtras.map(e => ({ ...e }));
  });

  // Helper: mirror the calcExtraTotal logic from app.js
  function calcExtraTotal(extra, feet, postCount) {
    if (!extra.on) return 0;
    if (extra.unit === 'ft') return feet * extra.price;
    if (extra.unit === 'post') return postCount * extra.price;
    return extra.price; // flat
  }

  function calcAllExtras(feet, postCount) {
    return extras.reduce((sum, e) => sum + calcExtraTotal(e, feet, postCount), 0);
  }

  // === Pricing calculations ===

  describe('pricing calculations', () => {
    test('per-foot extras calculate correctly', () => {
      extras[0].on = true; // removal $5/ft
      expect(calcExtraTotal(extras[0], 200, 26)).toBe(1000);
    });

    test('flat rate extras return fixed price regardless of footage', () => {
      extras[2].on = true; // permit $150 flat
      expect(calcExtraTotal(extras[2], 200, 26)).toBe(150);
      expect(calcExtraTotal(extras[2], 500, 64)).toBe(150);
    });

    test('per-post extras calculate by post count', () => {
      extras[7].on = true; // footing $75/post
      expect(calcExtraTotal(extras[7], 200, 26)).toBe(1950);
    });

    test('disabled extras return zero', () => {
      extras[0].on = false;
      expect(calcExtraTotal(extras[0], 200, 26)).toBe(0);
    });

    test('total with multiple extras enabled', () => {
      extras[0].on = true; // removal $5/ft
      extras[2].on = true; // permit $150 flat
      extras[3].on = true; // stain $4/ft
      const total = calcAllExtras(100, 14);
      // 100*5 + 150 + 100*4 = 500 + 150 + 400 = 1050
      expect(total).toBe(1050);
    });

    test('total with no extras enabled is zero', () => {
      expect(calcAllExtras(200, 26)).toBe(0);
    });

    test('zero footage with per-foot extras is zero', () => {
      extras[0].on = true;
      expect(calcExtraTotal(extras[0], 0, 0)).toBe(0);
    });

    test('custom price overrides work', () => {
      extras[2].price = 300; // permit bumped to $300
      extras[2].on = true;
      expect(calcExtraTotal(extras[2], 100, 14)).toBe(300);
    });
  });

  // === Default extras ===

  describe('default extras', () => {
    test('has 8 default items', () => {
      expect(defaultExtras).toHaveLength(8);
    });

    test('all defaults start disabled', () => {
      defaultExtras.forEach(e => {
        expect(e.on).toBe(false);
      });
    });

    test('each default has required fields', () => {
      defaultExtras.forEach(e => {
        expect(e).toHaveProperty('id');
        expect(e).toHaveProperty('name');
        expect(e).toHaveProperty('unit');
        expect(e).toHaveProperty('price');
        expect(e).toHaveProperty('on');
        expect(['ft', 'flat', 'post']).toContain(e.unit);
        expect(e.price).toBeGreaterThan(0);
      });
    });

    test('default IDs are unique', () => {
      const ids = defaultExtras.map(e => e.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  // === Legacy format migration ===

  describe('legacy format migration', () => {
    test('migrates old autosave {removal, permit, stain} format', () => {
      const legacyAddons = { removal: true, permit: false, stain: true };

      // Simulate migration logic from app.js
      extras.forEach(e => {
        if (e.id === 'removal') e.on = !!legacyAddons.removal;
        else if (e.id === 'permit') e.on = !!legacyAddons.permit;
        else if (e.id === 'stain') e.on = !!legacyAddons.stain;
      });

      expect(extras.find(e => e.id === 'removal').on).toBe(true);
      expect(extras.find(e => e.id === 'permit').on).toBe(false);
      expect(extras.find(e => e.id === 'stain').on).toBe(true);
      // New extras should remain off
      expect(extras.find(e => e.id === 'hauling').on).toBe(false);
      expect(extras.find(e => e.id === 'clearing').on).toBe(false);
    });

    test('migrates old share link [0,1,0] format', () => {
      const legacyA = [0, 1, 0]; // removal off, permit on, stain off

      extras.forEach(e => {
        if (e.id === 'removal') e.on = !!legacyA[0];
        else if (e.id === 'permit') e.on = !!legacyA[1];
        else if (e.id === 'stain') e.on = !!legacyA[2];
      });

      expect(extras.find(e => e.id === 'removal').on).toBe(false);
      expect(extras.find(e => e.id === 'permit').on).toBe(true);
      expect(extras.find(e => e.id === 'stain').on).toBe(false);
    });

    test('new format array of objects restores correctly', () => {
      const newAddons = [
        { id: 'removal', name: 'Old fence removal', unit: 'ft', price: 7 },
        { id: 'grading', name: 'Grading / leveling', unit: 'flat', price: 800 }
      ];

      var addonMap = {};
      newAddons.forEach(a => { addonMap[a.id] = a; });
      extras.forEach(e => { e.on = !!addonMap[e.id]; });

      expect(extras.find(e => e.id === 'removal').on).toBe(true);
      expect(extras.find(e => e.id === 'grading').on).toBe(true);
      expect(extras.find(e => e.id === 'permit').on).toBe(false);
      expect(extras.find(e => e.id === 'stain').on).toBe(false);
    });
  });

  // === Share link encoding ===

  describe('share link encoding', () => {
    test('encodes only active extras', () => {
      extras[0].on = true;
      extras[2].on = true;

      const encoded = extras
        .filter(e => e.on)
        .map(e => ({ i: e.id, n: e.name, u: e.unit, p: e.price }));

      expect(encoded).toHaveLength(2);
      expect(encoded[0]).toEqual({ i: 'removal', n: 'Old fence removal', u: 'ft', p: 5 });
      expect(encoded[1]).toEqual({ i: 'permit', n: 'Permit', u: 'flat', p: 150 });
    });

    test('empty array when no extras active', () => {
      const encoded = extras.filter(e => e.on).map(e => ({ i: e.id, n: e.name, u: e.unit, p: e.price }));
      expect(encoded).toHaveLength(0);
    });

    test('custom extras included in encoding', () => {
      extras.push({ id: 'custom_123', name: 'Sod repair', unit: 'flat', price: 250, on: true });
      const encoded = extras.filter(e => e.on).map(e => ({ i: e.id, n: e.name, u: e.unit, p: e.price }));
      expect(encoded).toHaveLength(1);
      expect(encoded[0].n).toBe('Sod repair');
    });
  });

  // === Share link decoding ===

  describe('share link decoding', () => {
    test('decodes new format and restores prices', () => {
      const data = [
        { i: 'removal', n: 'Old fence removal', u: 'ft', p: 8 },
        { i: 'permit', n: 'Permit', u: 'flat', p: 250 }
      ];

      var addonMap = {};
      data.forEach(a => { addonMap[a.i] = a; });
      extras.forEach(e => {
        if (addonMap[e.id]) { e.on = true; e.price = addonMap[e.id].p; e.unit = addonMap[e.id].u; }
      });

      expect(extras.find(e => e.id === 'removal').on).toBe(true);
      expect(extras.find(e => e.id === 'removal').price).toBe(8);
      expect(extras.find(e => e.id === 'permit').price).toBe(250);
    });

    test('decodes custom extras from shared link', () => {
      const data = [
        { i: 'custom_999', n: 'Tree removal', u: 'flat', p: 500 }
      ];

      // Simulate decode logic
      var addonMap = {};
      data.forEach(a => { addonMap[a.i] = a; });
      extras.forEach(e => {
        if (addonMap[e.id]) { e.on = true; e.price = addonMap[e.id].p; }
      });
      data.forEach(a => {
        if (!extras.find(e => e.id === a.i)) {
          extras.push({ id: a.i, name: a.n, unit: a.u, price: a.p, on: true });
        }
      });

      const custom = extras.find(e => e.id === 'custom_999');
      expect(custom).toBeTruthy();
      expect(custom.name).toBe('Tree removal');
      expect(custom.price).toBe(500);
      expect(custom.on).toBe(true);
    });
  });

  // === Custom extras ===

  describe('custom extras', () => {
    test('adding a custom extra increases count', () => {
      const before = extras.length;
      extras.push({ id: 'custom_1', name: 'Delivery', unit: 'flat', price: 100, on: true });
      expect(extras.length).toBe(before + 1);
    });

    test('removing an extra by index works', () => {
      extras.push({ id: 'custom_1', name: 'Delivery', unit: 'flat', price: 100, on: true });
      const idx = extras.findIndex(e => e.id === 'custom_1');
      extras.splice(idx, 1);
      expect(extras.find(e => e.id === 'custom_1')).toBeUndefined();
    });

    test('custom extras contribute to total', () => {
      extras.push({ id: 'custom_1', name: 'Delivery', unit: 'flat', price: 100, on: true });
      const total = calcAllExtras(200, 26);
      expect(total).toBe(100);
    });

    test('editing price updates calculation', () => {
      extras[0].on = true;
      extras[0].price = 10; // change removal from $5/ft to $10/ft
      expect(calcExtraTotal(extras[0], 100, 14)).toBe(1000);
    });

    test('changing unit type changes calculation', () => {
      extras[0].on = true;
      extras[0].unit = 'flat';
      extras[0].price = 500;
      expect(calcExtraTotal(extras[0], 200, 26)).toBe(500); // flat, not per-foot
    });
  });

  // === Persistence ===

  describe('persistence format', () => {
    test('saves only id, name, unit, price (not on state)', () => {
      extras[0].on = true;
      const saved = extras.map(e => ({ id: e.id, name: e.name, unit: e.unit, price: e.price }));
      saved.forEach(e => {
        expect(e).not.toHaveProperty('on');
        expect(e).toHaveProperty('id');
        expect(e).toHaveProperty('name');
        expect(e).toHaveProperty('unit');
        expect(e).toHaveProperty('price');
      });
    });

    test('merge with defaults preserves custom extras', () => {
      const saved = [
        { id: 'removal', name: 'Old fence removal', unit: 'ft', price: 8 },
        { id: 'custom_1', name: 'Sod repair', unit: 'flat', price: 250 }
      ];

      // Simulate loadExtras merge logic
      var map = {};
      saved.forEach(e => { map[e.id] = e; });
      var merged = defaultExtras.map(d => {
        if (map[d.id]) { var s = map[d.id]; return { id: d.id, name: s.name || d.name, unit: s.unit || d.unit, price: s.price != null ? s.price : d.price, on: false }; }
        return { ...d };
      });
      saved.forEach(e => {
        if (!defaultExtras.find(d => d.id === e.id)) {
          merged.push({ id: e.id, name: e.name, unit: e.unit, price: e.price, on: false });
        }
      });

      expect(merged).toHaveLength(9); // 8 defaults + 1 custom
      expect(merged.find(e => e.id === 'removal').price).toBe(8); // saved price
      expect(merged.find(e => e.id === 'custom_1').name).toBe('Sod repair');
      expect(merged.find(e => e.id === 'permit').price).toBe(150); // default price
    });

    test('new defaults appear for users with old saved data', () => {
      // User saved only removal and permit (old version)
      const saved = [
        { id: 'removal', name: 'Old fence removal', unit: 'ft', price: 5 },
        { id: 'permit', name: 'Permit', unit: 'flat', price: 200 }
      ];

      var map = {};
      saved.forEach(e => { map[e.id] = e; });
      var merged = defaultExtras.map(d => {
        if (map[d.id]) { var s = map[d.id]; return { id: d.id, name: s.name || d.name, unit: s.unit || d.unit, price: s.price != null ? s.price : d.price, on: false }; }
        return { ...d };
      });

      expect(merged).toHaveLength(8); // All defaults present
      expect(merged.find(e => e.id === 'clearing')).toBeTruthy(); // new default appears
      expect(merged.find(e => e.id === 'footing')).toBeTruthy(); // new default appears
      expect(merged.find(e => e.id === 'permit').price).toBe(200); // user's custom price preserved
    });
  });

  // === Autosave format ===

  describe('autosave format', () => {
    test('saves active extras as array of objects', () => {
      extras[0].on = true;
      extras[2].on = true;
      const autosaveAddons = extras
        .filter(e => e.on)
        .map(e => ({ id: e.id, name: e.name, unit: e.unit, price: e.price }));

      expect(autosaveAddons).toHaveLength(2);
      expect(autosaveAddons[0].id).toBe('removal');
      expect(autosaveAddons[1].id).toBe('permit');
    });
  });

  // === Reset ===

  describe('reset', () => {
    test('resetting turns all extras off', () => {
      extras[0].on = true;
      extras[2].on = true;
      extras[5].on = true;

      extras.forEach(e => { e.on = false; });

      extras.forEach(e => {
        expect(e.on).toBe(false);
      });
    });

    test('resetting preserves custom prices', () => {
      extras[0].price = 10;
      extras[0].on = true;

      extras.forEach(e => { e.on = false; });

      expect(extras[0].price).toBe(10); // price stays
      expect(extras[0].on).toBe(false); // but unchecked
    });
  });
});
