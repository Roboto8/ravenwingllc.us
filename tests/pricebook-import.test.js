// Price-paste import parser (mirror of index.html parsePricebookText)
const { parsePricebookText } = require('../client/dist/js/bom');

describe('parsePricebookText', () => {
  test('parses the QA-doc markdown table exactly as documented', () => {
    const table = `
| Price-book field        | Real price | SKU basis                                   |
|-------------------------|-----------:|---------------------------------------------|
| wood.6.postCost         | 9.98       | 4x4x8 PT #2 GC (HD 194354)                  |
| wood.6.cornerPostCost   | 9.98       | same lumber — raise it if you'd brace        |
| wood.6.postCostGothic   | 26.99      | 4x4x8 French Gothic (Sutherlands 23168)      |
| wood.6.railCost         | 4.58       | 2x4x8 PT (HD 106147)                         |
| wood.6.railCost16       | 13.88      | 2x4x16 PT GC (Stine live price)              |
| wood.6.picketCost       | 2.38       | 5/8x5-1/2x6 dog-ear (HD 102560)              |
| wood.extra.bracketCost  | 0.98       | Simpson FB24Z                                |
| wood.extra.postCapCost  | 7.98       | ProWood Hampton flat cap                     |
| wood.extra.concreteBagCost | 7.97    | Quikrete 50 lb FAST-SET (see caveats)        |
| wood.extra.screwBoxCost | 10.97      | Deckmate 1 lb box (see caveats)              |
`;
    const r = parsePricebookText(table);
    expect(r.count).toBe(10);
    expect(r.entries['wood.6.postCost']).toBe(9.98);
    expect(r.entries['wood.6.cornerPostCost']).toBe(9.98);
    expect(r.entries['wood.6.postCostGothic']).toBe(26.99);
    expect(r.entries['wood.extra.screwBoxCost']).toBe(10.97);
    expect(r.skipped).toBe(0); // header + separator rows are not "skipped"
  });

  test('parses a JSON object and rejects bad keys/values inside it', () => {
    const r = parsePricebookText(JSON.stringify({
      'labor.default': 15,
      'markup.percent': 10,
      'constructor': 99,
      'wood.6.postCost': 2000000
    }));
    expect(r.count).toBe(2);
    expect(r.entries['labor.default']).toBe(15);
    expect(r.entries.constructor).toBeUndefined();
    expect(r.skipped).toBe(2);
  });

  test('parses key value, key=value, and CSV lines with $ signs', () => {
    const r = parsePricebookText([
      'labor.default 15',
      'labor.gate=75',
      'markup.percent: 10',
      'markup.jobMin,750',
      'perFoot.wood $27'
    ].join('\n'));
    expect(r.count).toBe(5);
    expect(r.entries['labor.gate']).toBe(75);
    expect(r.entries['markup.jobMin']).toBe(750);
    expect(r.entries['perFoot.wood']).toBe(27);
  });

  test('chain-link extra and height keys parse', () => {
    const r = parsePricebookText('chain-link.4.linePostCost 19.97\nchain-link.extra.tensionBandCost 1.66');
    expect(r.count).toBe(2);
    expect(r.entries['chain-link.4.linePostCost']).toBe(19.97);
  });

  test('counts unparseable key-shaped lines as skipped', () => {
    const r = parsePricebookText('wood.6.postCost nine dollars\nlinePostCost 19.97');
    expect(r.count).toBe(0);
    expect(r.skipped).toBe(2);
  });

  test('caps imported entries at the server limit (500)', () => {
    const lines = [];
    for (let i = 0; i < 600; i++) lines.push('labor.k' + i + ' 5');
    const r = parsePricebookText(lines.join('\n'));
    expect(r.count).toBe(500);
  });

  test('empty / prose-only input returns zero without errors', () => {
    expect(parsePricebookText('').count).toBe(0);
    expect(parsePricebookText('hello world').count).toBe(0);
    expect(parsePricebookText(null).count).toBe(0);
  });
});
