const {
  BOM,
  MULCH,
  calculateBOM,
  calculateMulchBOM
} = require('../client/preview/js/bom');

// =============================================================================
// HELPER: Format BOM items as CSV
// =============================================================================
function formatBomCsv(items) {
  const header = 'Item,Qty,Unit,Unit Cost,Total';
  const rows = items
    .filter(i => !i.isHeader)
    .map(i => {
      // Escape item names that contain commas by wrapping in double quotes
      const name = i.name.includes(',') ? '"' + i.name + '"' : i.name;
      return [name, i.qty, i.unit, i.unitCost.toFixed(2), i.total.toFixed(2)].join(',');
    });
  return [header, ...rows].join('\n');
}

// =============================================================================
// HELPER: Format BOM items as plain text for clipboard (qty + name only)
// =============================================================================
function formatBomClipboard(items) {
  return items.map(i => {
    if (i.isHeader) return '--- ' + i.name + ' ---';
    return i.qty + ' x ' + i.name;
  }).join('\n');
}

// =============================================================================
// BOM calculation produces exportable data
// =============================================================================
describe('BOM produces exportable data', () => {
  test('calculateBOM items have name, qty, unit, unitCost, total', () => {
    const bom = calculateBOM(100, 'wood', 6);
    bom.items.forEach(item => {
      expect(item).toHaveProperty('name');
      expect(item).toHaveProperty('qty');
      expect(item).toHaveProperty('unit');
      expect(item).toHaveProperty('unitCost');
      expect(item).toHaveProperty('total');
    });
  });

  test('calculateMulchBOM items have name, qty, unit, unitCost, total', () => {
    const bom = calculateMulchBOM(500, 'hardwood', 3, { addFabric: true });
    bom.items.forEach(item => {
      expect(item).toHaveProperty('name');
      expect(item).toHaveProperty('qty');
      expect(item).toHaveProperty('unit');
      expect(item).toHaveProperty('unitCost');
      expect(item).toHaveProperty('total');
    });
  });

  test('items with isHeader flag can be filtered out', () => {
    const bom = calculateBOM(100, 'wood', 6);
    // Inject a header item to simulate the app behavior
    const itemsWithHeader = [
      { isHeader: true, name: 'Wood Fence Materials', qty: 0, unit: '', unitCost: 0, total: 0 },
      ...bom.items
    ];
    const dataOnly = itemsWithHeader.filter(i => !i.isHeader);
    expect(dataOnly.length).toBe(bom.items.length);
    expect(dataOnly.every(i => !i.isHeader)).toBe(true);
  });

  test('zero-qty items are filtered out of calculateBOM results', () => {
    const bom = calculateBOM(0, 'wood', 6);
    bom.items.forEach(item => {
      expect(item.qty).toBeGreaterThan(0);
    });
  });

  test('zero-qty items are filtered out of calculateMulchBOM results', () => {
    const bom = calculateMulchBOM(0, 'hardwood', 3);
    bom.items.forEach(item => {
      expect(item.qty).toBeGreaterThan(0);
    });
  });

  test('all fence types produce items with required export fields', () => {
    ['wood', 'vinyl', 'chain-link', 'aluminum', 'iron'].forEach(type => {
      const bom = calculateBOM(100, type, 6);
      expect(bom.items.length).toBeGreaterThan(0);
      bom.items.forEach(item => {
        expect(typeof item.name).toBe('string');
        expect(typeof item.qty).toBe('number');
        expect(typeof item.unit).toBe('string');
        expect(typeof item.unitCost).toBe('number');
        expect(typeof item.total).toBe('number');
      });
    });
  });
});

// =============================================================================
// BOM override behavior
// =============================================================================
describe('BOM override behavior for export', () => {
  test('applying qty override via custom pricing does not change qty directly', () => {
    // Custom pricing affects unitCost, not qty - qty is calculated from footage
    const bomDefault = calculateBOM(100, 'wood', 6);
    const bomCustom = calculateBOM(100, 'wood', 6, {
      customPricing: { 'wood.6.postCost': 50 }
    });
    const defaultPost = bomDefault.items.find(i => i.name.includes('posts'));
    const customPost = bomCustom.items.find(i => i.name.includes('posts'));
    // Qty stays the same
    expect(customPost.qty).toBe(defaultPost.qty);
    // Total changes because unitCost changed
    expect(customPost.total).toBeGreaterThan(defaultPost.total);
  });

  test('applying price override changes item total', () => {
    const bom = calculateBOM(100, 'wood', 6, {
      customPricing: { 'wood.6.postCost': 100 }
    });
    const postItem = bom.items.find(i => i.name.includes('posts'));
    expect(postItem.unitCost).toBe(100);
    expect(postItem.total).toBe(Math.round(postItem.qty * 100 * 100) / 100);
  });

  test('price override on one item does not affect other items', () => {
    const bomDefault = calculateBOM(100, 'wood', 6);
    const bomCustom = calculateBOM(100, 'wood', 6, {
      customPricing: { 'wood.6.postCost': 100 }
    });

    // Rails should be unchanged
    const defaultRail = bomDefault.items.find(i => i.name.includes('rails'));
    const customRail = bomCustom.items.find(i => i.name.includes('rails'));
    expect(customRail.unitCost).toBe(defaultRail.unitCost);
    expect(customRail.total).toBe(defaultRail.total);

    // Pickets should be unchanged
    const defaultPicket = bomDefault.items.find(i => i.name.includes('pickets'));
    const customPicket = bomCustom.items.find(i => i.name.includes('pickets'));
    expect(customPicket.unitCost).toBe(defaultPicket.unitCost);
    expect(customPicket.total).toBe(defaultPicket.total);
  });

  test('extras price override only affects that extra item', () => {
    const bomDefault = calculateBOM(100, 'wood', 6);
    const bomCustom = calculateBOM(100, 'wood', 6, {
      customPricing: { 'wood.extra.concreteBagCost': 20 }
    });

    const defaultConcrete = bomDefault.items.find(i => i.name.includes('concrete'));
    const customConcrete = bomCustom.items.find(i => i.name.includes('concrete'));
    expect(customConcrete.unitCost).toBe(20);
    expect(customConcrete.total).toBeGreaterThan(defaultConcrete.total);

    // Post caps should be unchanged
    const defaultCaps = bomDefault.items.find(i => i.name.includes('Post caps'));
    const customCaps = bomCustom.items.find(i => i.name.includes('Post caps'));
    expect(customCaps.unitCost).toBe(defaultCaps.unitCost);
    expect(customCaps.total).toBe(defaultCaps.total);
  });

  test('mulch custom pricing override changes total', () => {
    const bomDefault = calculateMulchBOM(500, 'hardwood', 3);
    const bomCustom = calculateMulchBOM(500, 'hardwood', 3, {
      customPricing: { 'mulch.hardwood.bagCost': 20 }
    });
    expect(bomCustom.materialTotal).toBeGreaterThan(bomDefault.materialTotal);
    expect(bomCustom.items[0].unitCost).toBe(20);
  });
});

// =============================================================================
// CSV format validation
// =============================================================================
describe('CSV format validation', () => {
  test('CSV header row is correct', () => {
    const bom = calculateBOM(100, 'wood', 6);
    const csv = formatBomCsv(bom.items);
    const firstLine = csv.split('\n')[0];
    expect(firstLine).toBe('Item,Qty,Unit,Unit Cost,Total');
  });

  test('CSV rows contain correct number of fields', () => {
    const bom = calculateBOM(100, 'wood', 6);
    const csv = formatBomCsv(bom.items);
    const lines = csv.split('\n');
    // Skip header
    for (let i = 1; i < lines.length; i++) {
      // Simple items without commas in names have 5 fields
      const fields = lines[i].split(',');
      expect(fields.length).toBeGreaterThanOrEqual(5);
    }
  });

  test('commas in item names are properly escaped with quotes', () => {
    // Create a synthetic item with a comma in the name
    const items = [
      { name: 'Bolts, nuts, and washers', qty: 10, unit: 'ea', unitCost: 1.50, total: 15.00 }
    ];
    const csv = formatBomCsv(items);
    const dataLine = csv.split('\n')[1];
    // Name should be wrapped in double quotes
    expect(dataLine).toContain('"Bolts, nuts, and washers"');
    // Should still parse correctly - quoted field + 4 unquoted fields
    expect(dataLine).toBe('"Bolts, nuts, and washers",10,ea,1.50,15.00');
  });

  test('item names without commas are not quoted', () => {
    const items = [
      { name: 'Post caps', qty: 14, unit: 'ea', unitCost: 4.00, total: 56.00 }
    ];
    const csv = formatBomCsv(items);
    const dataLine = csv.split('\n')[1];
    expect(dataLine).toBe('Post caps,14,ea,4.00,56.00');
  });

  test('CSV from a real BOM has data rows matching item count', () => {
    const bom = calculateBOM(100, 'vinyl', 6);
    const csv = formatBomCsv(bom.items);
    const lines = csv.split('\n');
    // 1 header + N data rows
    expect(lines.length).toBe(1 + bom.items.length);
  });

  test('header items are excluded from CSV output', () => {
    const items = [
      { isHeader: true, name: 'Fence Materials', qty: 0, unit: '', unitCost: 0, total: 0 },
      { name: 'Posts', qty: 14, unit: 'ea', unitCost: 16.00, total: 224.00 },
      { name: 'Rails', qty: 39, unit: 'ea', unitCost: 6.00, total: 234.00 }
    ];
    const csv = formatBomCsv(items);
    const lines = csv.split('\n');
    // Header + 2 data rows (the isHeader item is excluded)
    expect(lines.length).toBe(3);
    expect(csv).not.toContain('Fence Materials');
  });

  test('CSV unitCost and total are formatted to 2 decimal places', () => {
    const bom = calculateBOM(100, 'wood', 6);
    const csv = formatBomCsv(bom.items);
    const lines = csv.split('\n').slice(1); // skip header
    lines.forEach(line => {
      // Last two fields should have 2 decimal places
      const parts = line.split(',');
      const unitCost = parts[parts.length - 2];
      const total = parts[parts.length - 1];
      expect(unitCost).toMatch(/^\d+\.\d{2}$/);
      expect(total).toMatch(/^\d+\.\d{2}$/);
    });
  });
});

// =============================================================================
// Clipboard text format
// =============================================================================
describe('Clipboard text format', () => {
  test('plain text shows qty x name for regular items', () => {
    const items = [
      { name: '4x4x8 PT posts', qty: 14, unit: 'ea', unitCost: 16, total: 224 }
    ];
    const text = formatBomClipboard(items);
    expect(text).toBe('14 x 4x4x8 PT posts');
  });

  test('headers are formatted as category separators', () => {
    const items = [
      { isHeader: true, name: 'Wood Fence Materials' },
      { name: 'Posts', qty: 14, unit: 'ea', unitCost: 16, total: 224 },
      { name: 'Rails', qty: 39, unit: 'ea', unitCost: 6, total: 234 }
    ];
    const text = formatBomClipboard(items);
    const lines = text.split('\n');
    expect(lines[0]).toBe('--- Wood Fence Materials ---');
    expect(lines[1]).toBe('14 x Posts');
    expect(lines[2]).toBe('39 x Rails');
  });

  test('clipboard text does not include prices', () => {
    const bom = calculateBOM(100, 'wood', 6);
    const text = formatBomClipboard(bom.items);
    // Should not contain dollar signs or the word "cost"
    expect(text).not.toContain('$');
    expect(text.toLowerCase()).not.toContain('cost');
    // Should not contain unitCost values as standalone numbers after commas
    bom.items.forEach(item => {
      expect(text).not.toContain(item.total.toFixed(2));
    });
  });

  test('clipboard text includes all items from BOM', () => {
    const bom = calculateBOM(100, 'vinyl', 6);
    const text = formatBomClipboard(bom.items);
    const lines = text.split('\n');
    expect(lines.length).toBe(bom.items.length);
    bom.items.forEach(item => {
      expect(text).toContain(item.name);
    });
  });

  test('clipboard format with mixed headers and items', () => {
    const items = [
      { isHeader: true, name: 'Fence' },
      { name: 'Posts', qty: 5, unit: 'ea', unitCost: 10, total: 50 },
      { isHeader: true, name: 'Hardware' },
      { name: 'Screws', qty: 100, unit: 'ea', unitCost: 0.10, total: 10 }
    ];
    const text = formatBomClipboard(items);
    const lines = text.split('\n');
    expect(lines).toEqual([
      '--- Fence ---',
      '5 x Posts',
      '--- Hardware ---',
      '100 x Screws'
    ]);
  });

  test('mulch BOM clipboard output shows qty and name', () => {
    const bom = calculateMulchBOM(500, 'cedar', 3, { addFabric: true });
    const text = formatBomClipboard(bom.items);
    bom.items.forEach(item => {
      expect(text).toContain(item.qty + ' x ' + item.name);
    });
  });
});
