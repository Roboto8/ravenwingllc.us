/**
 * Delete Mode Tests
 *
 * Tests for the delete mode feature including:
 * - Toggle on/off behavior
 * - Fence section selection and deletion
 * - Mulch area selection and deletion
 * - Gate selection and deletion
 * - Selection bar UI
 * - Exit delete mode cleanup
 * - Function naming (removeSection vs deleteSection)
 * - hideDeleteModeBar → hideSelectionBar fix
 * - Stacking click handler prevention
 */
const puppeteer = require('puppeteer-core');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const INDEX_URL = 'file:///' + path.resolve(__dirname, '../client/preview/index.html').replace(/\\/g, '/');

const delay = ms => new Promise(r => setTimeout(r, ms));

let browser;

beforeAll(async () => {
  browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security']
  });
}, 30000);

afterAll(async () => {
  if (browser) await browser.close();
});

// Helper: create a page with the app loaded
async function createPage(width = 1280, height = 720) {
  const page = await browser.newPage();
  await page.setViewport({ width, height });
  await page.goto(INDEX_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await delay(1000);
  // Dismiss onboarding/quickstart if present
  await page.evaluate(() => {
    localStorage.setItem('fc_onboarded', 'true');
    localStorage.setItem('fc_quickstart_seen', '1');
    localStorage.setItem('fc_visited', '1');
    var ob = document.getElementById('onboarding-overlay');
    if (ob) ob.style.display = 'none';
    var qs = document.getElementById('quickstart-tips');
    if (qs) qs.remove();
  });
  await delay(300);
  return page;
}

// ============================================================
// CODE INTEGRITY TESTS — verify critical functions exist
// ============================================================
describe('Delete mode - code integrity', () => {
  test('deleteSection function exists (not removeSection)', async () => {
    const page = await createPage();
    const result = await page.evaluate(() => {
      return {
        deleteSection: typeof deleteSection === 'function',
        removeSection: typeof removeSection === 'function'
      };
    });
    expect(result.deleteSection).toBe(true);
    expect(result.removeSection).toBe(false);
    await page.close();
  }, 20000);

  test('hideSelectionBar function exists', async () => {
    const page = await createPage();
    const result = await page.evaluate(() => {
      return typeof hideSelectionBar === 'function';
    });
    expect(result).toBe(true);
    await page.close();
  }, 20000);

  test('hideDeleteModeBar should not exist as a separate function', async () => {
    const page = await createPage();
    const result = await page.evaluate(() => {
      return typeof hideDeleteModeBar === 'function';
    });
    // hideDeleteModeBar was removed — exitDeleteMode now calls hideSelectionBar
    expect(result).toBe(false);
    await page.close();
  }, 20000);

  test('toggleDeleteMode function exists', async () => {
    const page = await createPage();
    const result = await page.evaluate(() => {
      return typeof toggleDeleteMode === 'function';
    });
    expect(result).toBe(true);
    await page.close();
  }, 20000);

  test('selectMulchArea function exists', async () => {
    const page = await createPage();
    const result = await page.evaluate(() => {
      return typeof selectMulchArea === 'function';
    });
    expect(result).toBe(true);
    await page.close();
  }, 20000);

  test('selectFenceSection function exists', async () => {
    const page = await createPage();
    const result = await page.evaluate(() => {
      return typeof selectFenceSection === 'function';
    });
    expect(result).toBe(true);
    await page.close();
  }, 20000);

  test('selectGate function exists', async () => {
    const page = await createPage();
    const result = await page.evaluate(() => {
      return typeof selectGate === 'function';
    });
    expect(result).toBe(true);
    await page.close();
  }, 20000);

  test('removeMulchArea function exists', async () => {
    const page = await createPage();
    const result = await page.evaluate(() => {
      return typeof removeMulchArea === 'function';
    });
    expect(result).toBe(true);
    await page.close();
  }, 20000);

  test('exitDeleteMode function exists', async () => {
    const page = await createPage();
    const result = await page.evaluate(() => {
      return typeof exitDeleteMode === 'function';
    });
    expect(result).toBe(true);
    await page.close();
  }, 20000);
});

// ============================================================
// TOGGLE DELETE MODE
// ============================================================
describe('Delete mode - toggle behavior', () => {
  test('toggleDeleteMode sets _deleteMode true', async () => {
    const page = await createPage();
    const result = await page.evaluate(() => {
      toggleDeleteMode();
      return _deleteMode;
    });
    expect(result).toBe(true);
    await page.close();
  }, 20000);

  test('toggleDeleteMode twice returns to false', async () => {
    const page = await createPage();
    const result = await page.evaluate(() => {
      toggleDeleteMode();
      toggleDeleteMode();
      return _deleteMode;
    });
    expect(result).toBe(false);
    await page.close();
  }, 20000);

  test('delete button gets active class when toggled on', async () => {
    const page = await createPage();
    const result = await page.evaluate(() => {
      toggleDeleteMode();
      var btn = document.getElementById('delete-mode-btn');
      return btn ? btn.classList.contains('active') : false;
    });
    expect(result).toBe(true);
    await page.close();
  }, 20000);

  test('delete button loses active class when toggled off', async () => {
    const page = await createPage();
    const result = await page.evaluate(() => {
      toggleDeleteMode();
      toggleDeleteMode();
      var btn = document.getElementById('delete-mode-btn');
      return btn ? btn.classList.contains('active') : true;
    });
    expect(result).toBe(false);
    await page.close();
  }, 20000);

  test('cursor changes to crosshair in delete mode', async () => {
    const page = await createPage();
    const result = await page.evaluate(() => {
      toggleDeleteMode();
      return map.getContainer().style.cursor;
    });
    expect(result).toBe('crosshair');
    await page.close();
  }, 20000);

  test('cursor resets when exiting delete mode', async () => {
    const page = await createPage();
    const result = await page.evaluate(() => {
      toggleDeleteMode();
      exitDeleteMode();
      return map.getContainer().style.cursor;
    });
    expect(result).toBe('');
    await page.close();
  }, 20000);

  test('selection bar appears with instructions when entering delete mode', async () => {
    const page = await createPage();
    const result = await page.evaluate(() => {
      toggleDeleteMode();
      var bar = document.getElementById('selection-bar');
      return bar ? {
        display: bar.style.display,
        hasText: bar.textContent.length > 0,
        hasDoneBtn: bar.innerHTML.includes('Done')
      } : null;
    });
    expect(result).not.toBeNull();
    expect(result.display).toBe('flex');
    expect(result.hasText).toBe(true);
    expect(result.hasDoneBtn).toBe(true);
    await page.close();
  }, 20000);

  test('selection bar hidden after exiting delete mode', async () => {
    const page = await createPage();
    const result = await page.evaluate(() => {
      toggleDeleteMode();
      exitDeleteMode();
      var bar = document.getElementById('selection-bar');
      return bar ? bar.style.display : 'none';
    });
    expect(result).toBe('none');
    await page.close();
  }, 20000);

  test('exitDeleteMode does not throw (hideDeleteModeBar fix)', async () => {
    const page = await createPage();
    const result = await page.evaluate(() => {
      try {
        toggleDeleteMode();
        exitDeleteMode();
        return { success: true, error: null };
      } catch (e) {
        return { success: false, error: e.message };
      }
    });
    expect(result.success).toBe(true);
    expect(result.error).toBeNull();
    await page.close();
  }, 20000);
});

// ============================================================
// FENCE SECTION DELETION
// ============================================================
describe('Delete mode - fence section deletion', () => {
  test('selectFenceSection highlights section red', async () => {
    const page = await createPage();
    const result = await page.evaluate(() => {
      // Draw a few fence points to create a section with a line
      var center = map.getCenter();
      addFencePoint(L.latLng(center.lat, center.lng - 0.001));
      addFencePoint(L.latLng(center.lat + 0.001, center.lng));
      addFencePoint(L.latLng(center.lat, center.lng + 0.001));

      toggleDeleteMode();
      selectFenceSection(0);

      return {
        selectedIdx: _selectedFenceSectionIdx,
        lineColor: sections[0].line ? sections[0].line.options.color : null
      };
    });
    expect(result.selectedIdx).toBe(0);
    expect(result.lineColor).toBe('#ff4444');
    await page.close();
  }, 20000);

  test('selectFenceSection shows selection bar with Delete button', async () => {
    const page = await createPage();
    const result = await page.evaluate(() => {
      var center = map.getCenter();
      addFencePoint(L.latLng(center.lat, center.lng - 0.001));
      addFencePoint(L.latLng(center.lat + 0.001, center.lng));
      addFencePoint(L.latLng(center.lat, center.lng + 0.001));

      toggleDeleteMode();
      selectFenceSection(0);

      var bar = document.getElementById('selection-bar');
      var deleteBtn = document.getElementById('selection-delete-btn');
      return {
        barVisible: bar ? bar.style.display === 'flex' : false,
        hasDeleteBtn: !!deleteBtn,
        deleteBtnText: deleteBtn ? deleteBtn.textContent : ''
      };
    });
    expect(result.barVisible).toBe(true);
    expect(result.hasDeleteBtn).toBe(true);
    expect(result.deleteBtnText).toBe('Delete');
    await page.close();
  }, 20000);

  test('clicking Delete button actually removes the fence section', async () => {
    const page = await createPage();
    const result = await page.evaluate(() => {
      // Create two sections so deleteSection splices instead of calling clearAll
      var center = map.getCenter();
      addFencePoint(L.latLng(center.lat, center.lng - 0.001));
      addFencePoint(L.latLng(center.lat + 0.001, center.lng));

      addNewSection();
      addFencePoint(L.latLng(center.lat - 0.001, center.lng));
      addFencePoint(L.latLng(center.lat, center.lng + 0.001));

      var countBefore = sections.length;

      toggleDeleteMode();
      selectFenceSection(0);

      // Simulate clicking the delete button
      var deleteBtn = document.getElementById('selection-delete-btn');
      if (deleteBtn && deleteBtn.onclick) deleteBtn.onclick();

      return {
        countBefore: countBefore,
        countAfter: sections.length
      };
    });
    expect(result.countBefore).toBe(2);
    expect(result.countAfter).toBe(1);
    await page.close();
  }, 20000);

  test('deleteSection function removes fence points and layers', async () => {
    const page = await createPage();
    const result = await page.evaluate(() => {
      // Create two sections so deleteSection splices instead of clearing
      var center = map.getCenter();
      addFencePoint(L.latLng(center.lat, center.lng - 0.001));
      addFencePoint(L.latLng(center.lat + 0.001, center.lng));

      addNewSection();
      addFencePoint(L.latLng(center.lat - 0.001, center.lng));
      addFencePoint(L.latLng(center.lat, center.lng + 0.001));

      var countBefore = sections.length;
      ensureSection(0);
      deleteSection(0);

      return {
        countBefore: countBefore,
        countAfter: sections.length
      };
    });
    expect(result.countBefore).toBe(2);
    expect(result.countAfter).toBe(1);
    await page.close();
  }, 20000);
});

// ============================================================
// MULCH AREA DELETION
// ============================================================
describe('Delete mode - mulch area deletion', () => {
  test('selectMulchArea only works in delete mode', async () => {
    const page = await createPage();
    const result = await page.evaluate(() => {
      var center = map.getCenter();
      finalizeMulchArea([
        { lat: center.lat, lng: center.lng },
        { lat: center.lat + 0.0005, lng: center.lng },
        { lat: center.lat + 0.0005, lng: center.lng + 0.0005 },
        { lat: center.lat, lng: center.lng + 0.0005 }
      ]);

      // Try selecting without delete mode
      selectMulchArea(0, L.latLng(center.lat, center.lng));
      var withoutDeleteMode = _selectedMulchIdx;

      // Now with delete mode
      toggleDeleteMode();
      selectMulchArea(0, L.latLng(center.lat, center.lng));
      var withDeleteMode = _selectedMulchIdx;

      return { withoutDeleteMode, withDeleteMode };
    });
    expect(result.withoutDeleteMode).toBe(-1);
    expect(result.withDeleteMode).toBe(0);
    await page.close();
  }, 20000);

  test('removeMulchArea removes polygon from map and array', async () => {
    const page = await createPage();
    const result = await page.evaluate(() => {
      var center = map.getCenter();
      finalizeMulchArea([
        { lat: center.lat, lng: center.lng },
        { lat: center.lat + 0.0005, lng: center.lng },
        { lat: center.lat + 0.0005, lng: center.lng + 0.0005 },
        { lat: center.lat, lng: center.lng + 0.0005 }
      ]);
      finalizeMulchArea([
        { lat: center.lat + 0.001, lng: center.lng },
        { lat: center.lat + 0.0015, lng: center.lng },
        { lat: center.lat + 0.0015, lng: center.lng + 0.0005 },
        { lat: center.lat + 0.001, lng: center.lng + 0.0005 }
      ]);

      var countBefore = mulchAreas.length;
      removeMulchArea(0);
      return {
        countBefore: countBefore,
        countAfter: mulchAreas.length
      };
    });
    expect(result.countBefore).toBe(2);
    expect(result.countAfter).toBe(1);
    await page.close();
  }, 20000);

  test('removeMulchArea pushes to undo stack', async () => {
    const page = await createPage();
    const result = await page.evaluate(() => {
      var center = map.getCenter();
      finalizeMulchArea([
        { lat: center.lat, lng: center.lng },
        { lat: center.lat + 0.0005, lng: center.lng },
        { lat: center.lat + 0.0005, lng: center.lng + 0.0005 },
        { lat: center.lat, lng: center.lng + 0.0005 }
      ]);

      var undoBefore = undoStack.length;
      removeMulchArea(0);
      var undoAfter = undoStack.length;
      var lastUndo = undoStack[undoStack.length - 1];

      return {
        undoBefore,
        undoAfter,
        undoType: lastUndo ? lastUndo.type : null
      };
    });
    expect(result.undoAfter).toBeGreaterThan(result.undoBefore);
    expect(result.undoType).toBe('deleteMulch');
    await page.close();
  }, 20000);

  test('delete mode highlights mulch polygons with dashed border', async () => {
    const page = await createPage();
    const result = await page.evaluate(() => {
      var center = map.getCenter();
      finalizeMulchArea([
        { lat: center.lat, lng: center.lng },
        { lat: center.lat + 0.0005, lng: center.lng },
        { lat: center.lat + 0.0005, lng: center.lng + 0.0005 },
        { lat: center.lat, lng: center.lng + 0.0005 }
      ]);

      toggleDeleteMode();
      var polygon = mulchAreas[0].polygon;
      return {
        weight: polygon.options.weight,
        dashArray: polygon.options.dashArray
      };
    });
    expect(result.weight).toBe(4);
    expect(result.dashArray).toBe('8,4');
    await page.close();
  }, 20000);

  test('exiting delete mode restores normal polygon style', async () => {
    const page = await createPage();
    const result = await page.evaluate(() => {
      var center = map.getCenter();
      finalizeMulchArea([
        { lat: center.lat, lng: center.lng },
        { lat: center.lat + 0.0005, lng: center.lng },
        { lat: center.lat + 0.0005, lng: center.lng + 0.0005 },
        { lat: center.lat, lng: center.lng + 0.0005 }
      ]);

      toggleDeleteMode();
      exitDeleteMode();
      var polygon = mulchAreas[0].polygon;
      return {
        color: polygon.options.color,
        weight: polygon.options.weight,
        dashArray: polygon.options.dashArray
      };
    });
    expect(result.color).toBe('#00e64d');
    expect(result.weight).toBe(3);
    expect(result.dashArray).toBeNull();
    await page.close();
  }, 20000);
});

// ============================================================
// MULCH DRAG BEHAVIOR
// ============================================================
describe('Delete mode - mulch drag suppression', () => {
  test('mulch drag does not start in delete mode', async () => {
    const page = await createPage();
    const result = await page.evaluate(() => {
      setTool('mulch');
      toggleDeleteMode();

      // Simulate mousedown on map
      var center = map.getCenter();
      map.fire('mousedown', {
        latlng: center,
        originalEvent: { button: 0, shiftKey: false, target: map.getContainer() }
      });

      return mulchDragStart;
    });
    expect(result).toBeNull();
    await page.close();
  }, 20000);

  test('_lastDragRectTime variable exists for spurious click suppression', async () => {
    const page = await createPage();
    const result = await page.evaluate(() => {
      return typeof _lastDragRectTime === 'number';
    });
    expect(result).toBe(true);
    await page.close();
  }, 20000);
});

// ============================================================
// DESELECT AND CLEANUP
// ============================================================
describe('Delete mode - deselect and cleanup', () => {
  test('deselectAll resets all selection indices', async () => {
    const page = await createPage();
    const result = await page.evaluate(() => {
      _selectedMulchIdx = 5;
      _selectedFenceSectionIdx = 3;
      _selectedGateIdx = 2;
      deselectAll();
      return {
        mulch: _selectedMulchIdx,
        fence: _selectedFenceSectionIdx,
        gate: _selectedGateIdx
      };
    });
    expect(result.mulch).toBe(-1);
    expect(result.fence).toBe(-1);
    expect(result.gate).toBe(-1);
    await page.close();
  }, 20000);

  test('deselectAll hides the selection bar', async () => {
    const page = await createPage();
    const result = await page.evaluate(() => {
      // Create and show a selection bar
      showSelectionBar('Test', function() {});
      var visibleBefore = document.getElementById('selection-bar').style.display;
      deselectAll();
      var visibleAfter = document.getElementById('selection-bar').style.display;
      return { visibleBefore, visibleAfter };
    });
    expect(result.visibleBefore).toBe('flex');
    expect(result.visibleAfter).toBe('none');
    await page.close();
  }, 20000);
});

// ============================================================
// SELECTION BAR UI
// ============================================================
describe('Delete mode - selection bar', () => {
  test('showSelectionBar creates bar with text and buttons', async () => {
    const page = await createPage();
    const result = await page.evaluate(() => {
      showSelectionBar('Test Object — 100 ft', function() {});
      var bar = document.getElementById('selection-bar');
      return {
        text: bar.querySelector('.selection-text') ? bar.querySelector('.selection-text').textContent : '',
        hasDelete: !!bar.querySelector('.selection-delete-btn'),
        hasCancel: !!bar.querySelector('.selection-cancel-btn')
      };
    });
    expect(result.text).toBe('Test Object — 100 ft');
    expect(result.hasDelete).toBe(true);
    expect(result.hasCancel).toBe(true);
    await page.close();
  }, 20000);

  test('selection bar delete button fires callback', async () => {
    const page = await createPage();
    const result = await page.evaluate(() => {
      var callbackFired = false;
      showSelectionBar('Test', function() { callbackFired = true; });
      var btn = document.getElementById('selection-delete-btn');
      if (btn) btn.onclick();
      return callbackFired;
    });
    expect(result).toBe(true);
    await page.close();
  }, 20000);
});

// ============================================================
// CONTEXTUAL HINTS
// ============================================================
describe('Delete mode - contextual hints', () => {
  test('hint_delete_mode i18n key exists', async () => {
    const page = await createPage();
    const result = await page.evaluate(() => {
      return t('hint_delete_mode') !== 'hint_delete_mode';
    });
    expect(result).toBe(true);
    await page.close();
  }, 20000);

  test('hint_mulch_tool i18n key exists', async () => {
    const page = await createPage();
    const result = await page.evaluate(() => {
      return t('hint_mulch_tool') !== 'hint_mulch_tool';
    });
    expect(result).toBe(true);
    await page.close();
  }, 20000);

  test('hint_first_mulch i18n key exists', async () => {
    const page = await createPage();
    const result = await page.evaluate(() => {
      return t('hint_first_mulch') !== 'hint_first_mulch';
    });
    expect(result).toBe(true);
    await page.close();
  }, 20000);

  test('hint_curve_mode i18n key exists', async () => {
    const page = await createPage();
    const result = await page.evaluate(() => {
      return t('hint_curve_mode') !== 'hint_curve_mode';
    });
    expect(result).toBe(true);
    await page.close();
  }, 20000);

  test('hint_new_section i18n key exists', async () => {
    const page = await createPage();
    const result = await page.evaluate(() => {
      return t('hint_new_section') !== 'hint_new_section';
    });
    expect(result).toBe(true);
    await page.close();
  }, 20000);

  test('hint_save_estimate i18n key exists', async () => {
    const page = await createPage();
    const result = await page.evaluate(() => {
      return t('hint_save_estimate') !== 'hint_save_estimate';
    });
    expect(result).toBe(true);
    await page.close();
  }, 20000);

  test('hint_share_flow i18n key exists', async () => {
    const page = await createPage();
    const result = await page.evaluate(() => {
      return t('hint_share_flow') !== 'hint_share_flow';
    });
    expect(result).toBe(true);
    await page.close();
  }, 20000);

  test('hint_shapes_picker i18n key exists', async () => {
    const page = await createPage();
    const result = await page.evaluate(() => {
      return t('hint_shapes_picker') !== 'hint_shapes_picker';
    });
    expect(result).toBe(true);
    await page.close();
  }, 20000);

  test('hint_mobile_zoom i18n key exists', async () => {
    const page = await createPage();
    const result = await page.evaluate(() => {
      return t('hint_mobile_zoom') !== 'hint_mobile_zoom';
    });
    expect(result).toBe(true);
    await page.close();
  }, 20000);
});
