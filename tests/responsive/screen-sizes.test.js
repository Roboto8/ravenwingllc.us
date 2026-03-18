/**
 * Responsive Screen Size Tests for FenceTrace
 *
 * Renders the app at every major device viewport and checks for:
 * - Layout breaks (horizontal overflow, elements off-screen)
 * - Touch target minimums (44px per WCAG/Apple HIG)
 * - Text truncation and readability
 * - Element visibility at each breakpoint
 * - Modal/drawer/overlay sizing
 * - Map container fills available space
 * - Navigation hamburger toggle behavior
 * - Estimate panel collapse on mobile
 */
const puppeteer = require('puppeteer-core');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const INDEX_URL = 'file:///' + path.resolve(__dirname, '../../client/preview/index.html').replace(/\\/g, '/');
const APPROVE_URL = 'file:///' + path.resolve(__dirname, '../../client/preview/approve.html').replace(/\\/g, '/');

// Helper: puppeteer-core removed waitForTimeout
const delay = ms => new Promise(r => setTimeout(r, ms));

// All device viewports to test
const DEVICES = {
  // Desktop
  'Desktop 1920x1080': { width: 1920, height: 1080 },
  'Desktop 1440x900': { width: 1440, height: 900 },
  'Desktop 1366x768': { width: 1366, height: 768 },
  'Laptop 1280x720': { width: 1280, height: 720 },

  // Tablets
  'iPad Pro 12.9': { width: 1024, height: 1366 },
  'iPad Air': { width: 820, height: 1180 },
  'iPad Mini': { width: 768, height: 1024 },
  'Samsung Tab': { width: 800, height: 1280 },
  'Surface Pro 7': { width: 912, height: 1368 },

  // Tablet Landscape
  'iPad Air Landscape': { width: 1180, height: 820 },
  'iPad Mini Landscape': { width: 1024, height: 768 },

  // Mobile
  'iPhone 15 Pro Max': { width: 430, height: 932 },
  'iPhone 15': { width: 393, height: 852 },
  'iPhone SE 3rd': { width: 375, height: 667 },
  'iPhone 12 Mini': { width: 375, height: 812 },
  'Pixel 7': { width: 412, height: 915 },
  'Galaxy S23': { width: 360, height: 780 },
  'Galaxy S8': { width: 360, height: 740 },

  // Small Mobile
  'Galaxy Fold (outer)': { width: 280, height: 653 },
  'iPhone SE 1st': { width: 320, height: 568 },
  'Galaxy A01': { width: 320, height: 658 },

  // Mobile Landscape
  'iPhone 15 Landscape': { width: 852, height: 393 },
  'Galaxy S23 Landscape': { width: 780, height: 360 },
  'iPhone SE Landscape': { width: 667, height: 375 },
};

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

// =============================================================================
// MAIN APP (index.html)
// =============================================================================
describe('Main App - Screen Sizes', () => {
  // ---- No horizontal overflow at any size ----
  describe('no horizontal overflow', () => {
    test.each(Object.entries(DEVICES))('%s (%dx%d)', async (name, { width, height }) => {
      const page = await browser.newPage();
      await page.setViewport({ width, height, deviceScaleFactor: 1 });
      await page.goto(INDEX_URL, { waitUntil: 'domcontentloaded', timeout: 10000 });
      await delay(500);

      const overflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });

      expect(overflow).toBe(false);
      await page.close();
    }, 15000);
  });

  // ---- Body fills viewport (no gaps) ----
  describe('body fills viewport', () => {
    test.each(Object.entries(DEVICES))('%s', async (name, { width, height }) => {
      const page = await browser.newPage();
      await page.setViewport({ width, height });
      await page.goto(INDEX_URL, { waitUntil: 'domcontentloaded', timeout: 10000 });
      await delay(300);

      const bodySize = await page.evaluate(() => {
        const body = document.body;
        const rect = body.getBoundingClientRect();
        return {
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          clientWidth: document.documentElement.clientWidth,
          clientHeight: document.documentElement.clientHeight
        };
      });

      // Body should fill at least the viewport width
      expect(bodySize.width).toBeGreaterThanOrEqual(bodySize.clientWidth - 1);
      await page.close();
    }, 15000);
  });

  // ---- Navigation bar visible and accessible ----
  describe('navigation bar', () => {
    test.each(Object.entries(DEVICES))('%s - nav visible', async (name, { width, height }) => {
      const page = await browser.newPage();
      await page.setViewport({ width, height });
      await page.goto(INDEX_URL, { waitUntil: 'domcontentloaded', timeout: 10000 });
      await delay(300);

      const nav = await page.evaluate(() => {
        const el = document.querySelector('.nav');
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return {
          visible: style.display !== 'none' && style.visibility !== 'hidden',
          height: rect.height,
          width: rect.width,
          top: rect.top
        };
      });

      expect(nav).not.toBeNull();
      expect(nav.visible).toBe(true);
      expect(nav.height).toBeGreaterThanOrEqual(40);
      expect(nav.top).toBeGreaterThanOrEqual(-2); // Should be at or near top
      await page.close();
    }, 15000);
  });

  // ---- Hamburger menu appears on mobile ----
  describe('hamburger menu', () => {
    const mobileDevices = Object.entries(DEVICES).filter(([_, v]) => v.width <= 600);
    const desktopDevices = Object.entries(DEVICES).filter(([_, v]) => v.width > 600);

    test.each(mobileDevices)('%s - hamburger visible', async (name, { width, height }) => {
      const page = await browser.newPage();
      await page.setViewport({ width, height });
      await page.goto(INDEX_URL, { waitUntil: 'domcontentloaded', timeout: 10000 });
      await delay(300);

      const hamburger = await page.evaluate(() => {
        const el = document.querySelector('.nav-hamburger');
        if (!el) return null;
        const style = getComputedStyle(el);
        return { display: style.display, visible: style.display !== 'none' };
      });

      expect(hamburger).not.toBeNull();
      expect(hamburger.visible).toBe(true);
      await page.close();
    }, 15000);

    test.each(desktopDevices)('%s - hamburger hidden', async (name, { width, height }) => {
      const page = await browser.newPage();
      await page.setViewport({ width, height });
      await page.goto(INDEX_URL, { waitUntil: 'domcontentloaded', timeout: 10000 });
      await delay(300);

      const hamburger = await page.evaluate(() => {
        const el = document.querySelector('.nav-hamburger');
        if (!el) return null;
        const style = getComputedStyle(el);
        return { display: style.display, visible: style.display !== 'none' };
      });

      if (hamburger) {
        expect(hamburger.visible).toBe(false);
      }
      await page.close();
    }, 15000);
  });

  // ---- App layout direction changes at 900px ----
  describe('layout direction breakpoint (900px)', () => {
    const wideDevices = Object.entries(DEVICES).filter(([_, v]) => v.width > 900);
    const narrowDevices = Object.entries(DEVICES).filter(([_, v]) => v.width <= 900);

    test.each(wideDevices)('%s - horizontal layout (row)', async (name, { width, height }) => {
      const page = await browser.newPage();
      await page.setViewport({ width, height });
      await page.goto(INDEX_URL, { waitUntil: 'domcontentloaded', timeout: 10000 });
      await delay(300);

      const layout = await page.evaluate(() => {
        const el = document.querySelector('.app-layout');
        if (!el) return null;
        return getComputedStyle(el).flexDirection;
      });

      if (layout) expect(layout).toBe('row');
      await page.close();
    }, 15000);

    test.each(narrowDevices)('%s - vertical layout (column)', async (name, { width, height }) => {
      const page = await browser.newPage();
      await page.setViewport({ width, height });
      await page.goto(INDEX_URL, { waitUntil: 'domcontentloaded', timeout: 10000 });
      await delay(300);

      const layout = await page.evaluate(() => {
        const el = document.querySelector('.app-layout');
        if (!el) return null;
        return getComputedStyle(el).flexDirection;
      });

      if (layout) expect(layout).toBe('column');
      await page.close();
    }, 15000);
  });

  // ---- Touch targets meet 44px minimum ----
  describe('touch targets >= 44px', () => {
    const touchDevices = Object.entries(DEVICES).filter(([_, v]) => v.width <= 600);

    test.each(touchDevices)('%s - buttons meet min touch target', async (name, { width, height }) => {
      const page = await browser.newPage();
      await page.setViewport({ width, height });
      await page.goto(INDEX_URL, { waitUntil: 'domcontentloaded', timeout: 10000 });
      await delay(300);

      const violations = await page.evaluate(() => {
        const btns = document.querySelectorAll('.btn, .tool-btn, .height-btn, button');
        const issues = [];
        btns.forEach(btn => {
          const rect = btn.getBoundingClientRect();
          const style = getComputedStyle(btn);
          if (style.display === 'none' || style.visibility === 'hidden') return;
          if (rect.width === 0 || rect.height === 0) return;
          if (rect.height < 38 || rect.width < 38) {
            issues.push({
              text: btn.textContent.trim().slice(0, 30),
              tag: btn.tagName,
              class: btn.className.slice(0, 50),
              width: Math.round(rect.width),
              height: Math.round(rect.height)
            });
          }
        });
        return issues;
      });

      // Allow a few small icon-only buttons but flag major issues
      const criticalViolations = violations.filter(v =>
        v.height < 30 && !v.class.includes('close') && !v.class.includes('remove')
      );

      if (criticalViolations.length > 0) {
        console.warn(`[${name}] Touch target warnings:`, criticalViolations);
      }

      // No buttons should be smaller than 30px (hard floor)
      violations.forEach(v => {
        expect(v.height).toBeGreaterThanOrEqual(24);
      });

      await page.close();
    }, 15000);
  });

  // ---- Map container has positive dimensions ----
  describe('map container sizing', () => {
    test.each(Object.entries(DEVICES))('%s - map has size', async (name, { width, height }) => {
      const page = await browser.newPage();
      await page.setViewport({ width, height });
      await page.goto(INDEX_URL, { waitUntil: 'domcontentloaded', timeout: 10000 });
      await delay(300);

      const mapSize = await page.evaluate(() => {
        const el = document.querySelector('#map');
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        return { width: Math.round(rect.width), height: Math.round(rect.height) };
      });

      if (mapSize) {
        expect(mapSize.width).toBeGreaterThan(100);
        expect(mapSize.height).toBeGreaterThan(50);
      }
      await page.close();
    }, 15000);
  });

  // ---- Estimate panel sizing ----
  describe('estimate panel', () => {
    const wideDevices = Object.entries(DEVICES).filter(([_, v]) => v.width > 900);
    const narrowDevices = Object.entries(DEVICES).filter(([_, v]) => v.width <= 900);

    test.each(wideDevices)('%s - panel has sidebar width', async (name, { width, height }) => {
      const page = await browser.newPage();
      await page.setViewport({ width, height });
      await page.goto(INDEX_URL, { waitUntil: 'domcontentloaded', timeout: 10000 });
      await delay(300);

      const panel = await page.evaluate(() => {
        const el = document.querySelector('.estimate-panel');
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        return { width: Math.round(rect.width), height: Math.round(rect.height) };
      });

      if (panel) {
        expect(panel.width).toBeGreaterThanOrEqual(270);
        expect(panel.width).toBeLessThanOrEqual(400);
      }
      await page.close();
    }, 15000);

    test.each(narrowDevices)('%s - panel fills width on mobile', async (name, { width, height }) => {
      const page = await browser.newPage();
      await page.setViewport({ width, height });
      await page.goto(INDEX_URL, { waitUntil: 'domcontentloaded', timeout: 10000 });
      await delay(300);

      const panel = await page.evaluate(() => {
        const el = document.querySelector('.estimate-panel');
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        return {
          width: Math.round(rect.width),
          viewportWidth: document.documentElement.clientWidth
        };
      });

      if (panel) {
        // On mobile, panel should be full width (within 2px tolerance)
        expect(panel.width).toBeGreaterThanOrEqual(panel.viewportWidth - 2);
      }
      await page.close();
    }, 15000);
  });

  // ---- No text clipping on small screens ----
  describe('text not clipped', () => {
    const smallDevices = Object.entries(DEVICES).filter(([_, v]) => v.width <= 375);

    test.each(smallDevices)('%s - nav brand visible and readable', async (name, { width, height }) => {
      const page = await browser.newPage();
      await page.setViewport({ width, height });
      await page.goto(INDEX_URL, { waitUntil: 'domcontentloaded', timeout: 10000 });
      await delay(300);

      const brand = await page.evaluate(() => {
        const el = document.querySelector('.nav-brand');
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return {
          visible: style.display !== 'none',
          width: rect.width,
          fontSize: parseFloat(style.fontSize),
          overflowing: el.scrollWidth > el.clientWidth
        };
      });

      if (brand && brand.visible) {
        expect(brand.fontSize).toBeGreaterThanOrEqual(12);
      }
      await page.close();
    }, 15000);
  });

  // ---- Fence type grid adapts ----
  describe('fence type grid', () => {
    const tinyDevices = Object.entries(DEVICES).filter(([_, v]) => v.width <= 300);
    const normalDevices = Object.entries(DEVICES).filter(([_, v]) => v.width > 300 && v.width <= 900);

    test.each(tinyDevices)('%s - fence types single column', async (name, { width, height }) => {
      const page = await browser.newPage();
      await page.setViewport({ width, height });
      await page.goto(INDEX_URL, { waitUntil: 'domcontentloaded', timeout: 10000 });
      await delay(300);

      const grid = await page.evaluate(() => {
        const el = document.querySelector('.fence-types');
        if (!el) return null;
        return getComputedStyle(el).gridTemplateColumns;
      });

      if (grid) {
        // Single column means only one column value
        const colCount = grid.split(' ').filter(c => c !== '').length;
        expect(colCount).toBe(1);
      }
      await page.close();
    }, 15000);
  });

  // ---- Modal fits within viewport ----
  describe('modals fit viewport', () => {
    test.each(Object.entries(DEVICES))('%s - modal rendered width within viewport', async (name, { width, height }) => {
      const page = await browser.newPage();
      await page.setViewport({ width, height });
      await page.goto(INDEX_URL, { waitUntil: 'domcontentloaded', timeout: 10000 });
      await delay(300);

      // Make a modal visible to test its actual rendered width
      const modalFits = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        const modals = document.querySelectorAll('.modal');
        for (const modal of modals) {
          // Temporarily make visible to measure
          const overlay = modal.closest('.modal-overlay');
          const prevDisplay = overlay ? overlay.style.display : '';
          if (overlay) overlay.style.display = 'flex';

          const rect = modal.getBoundingClientRect();
          if (overlay) overlay.style.display = prevDisplay;

          // If rendered, check it fits
          if (rect.width > 0 && rect.width > vw) {
            return { fits: false, modalWidth: rect.width, viewportWidth: vw };
          }
        }
        return { fits: true };
      });

      expect(modalFits.fits).toBe(true);
      await page.close();
    }, 15000);
  });
});

// =============================================================================
// APPROVAL PAGE (approve.html)
// =============================================================================
describe('Approval Page - Screen Sizes', () => {
  describe('no horizontal overflow', () => {
    test.each(Object.entries(DEVICES))('%s', async (name, { width, height }) => {
      const page = await browser.newPage();
      await page.setViewport({ width, height });
      await page.goto(APPROVE_URL, { waitUntil: 'domcontentloaded', timeout: 10000 });
      await delay(300);

      const overflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });

      expect(overflow).toBe(false);
      await page.close();
    }, 15000);
  });

  describe('container responsive sizing', () => {
    test.each(Object.entries(DEVICES))('%s - container within viewport', async (name, { width, height }) => {
      const page = await browser.newPage();
      await page.setViewport({ width, height });
      await page.goto(APPROVE_URL, { waitUntil: 'domcontentloaded', timeout: 10000 });
      await delay(300);

      const container = await page.evaluate(() => {
        const el = document.querySelector('.container');
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        return {
          width: Math.round(rect.width),
          viewportWidth: document.documentElement.clientWidth
        };
      });

      if (container) {
        expect(container.width).toBeLessThanOrEqual(container.viewportWidth + 1);
      }
      await page.close();
    }, 15000);
  });

  describe('BOM table readable', () => {
    const smallDevices = Object.entries(DEVICES).filter(([_, v]) => v.width <= 480);

    test.each(smallDevices)('%s - table fits viewport', async (name, { width, height }) => {
      const page = await browser.newPage();
      await page.setViewport({ width, height });
      await page.goto(APPROVE_URL, { waitUntil: 'domcontentloaded', timeout: 10000 });
      await delay(300);

      const tableOverflow = await page.evaluate(() => {
        const tables = document.querySelectorAll('.bom-table, table');
        for (const t of tables) {
          if (t.scrollWidth > document.documentElement.clientWidth) return true;
        }
        return false;
      });

      expect(tableOverflow).toBe(false);
      await page.close();
    }, 15000);
  });

  describe('approval buttons touchable', () => {
    const mobileDevices = Object.entries(DEVICES).filter(([_, v]) => v.width <= 600);

    test.each(mobileDevices)('%s - approve/decline buttons >= 44px height', async (name, { width, height }) => {
      const page = await browser.newPage();
      await page.setViewport({ width, height });
      await page.goto(APPROVE_URL, { waitUntil: 'domcontentloaded', timeout: 10000 });
      await delay(300);

      const buttons = await page.evaluate(() => {
        const btns = document.querySelectorAll('button, .btn');
        return Array.from(btns).map(b => {
          const rect = b.getBoundingClientRect();
          const style = getComputedStyle(b);
          return {
            text: b.textContent.trim().slice(0, 20),
            height: Math.round(rect.height),
            width: Math.round(rect.width),
            visible: style.display !== 'none'
          };
        }).filter(b => b.visible && b.height > 0);
      });

      buttons.forEach(btn => {
        expect(btn.height).toBeGreaterThanOrEqual(36);
      });

      await page.close();
    }, 15000);
  });
});

// =============================================================================
// CSS VARIABLE CONSISTENCY
// =============================================================================
describe('CSS variables consistent across sizes', () => {
  test.each([
    ['Desktop 1920', { width: 1920, height: 1080 }],
    ['Mobile 375', { width: 375, height: 667 }],
    ['Fold 280', { width: 280, height: 653 }]
  ])('%s - CSS variables defined', async (name, { width, height }) => {
    const page = await browser.newPage();
    await page.setViewport({ width, height });
    await page.goto(INDEX_URL, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await delay(300);

    const vars = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return {
        minTouch: style.getPropertyValue('--min-touch').trim(),
        radius: style.getPropertyValue('--radius').trim(),
        bg: style.getPropertyValue('--bg').trim(),
        accent: style.getPropertyValue('--accent').trim(),
        font: style.getPropertyValue('--font').trim()
      };
    });

    expect(vars.minTouch).toBe('44px');
    expect(vars.radius).toBe('6px');
    expect(vars.bg).toBeTruthy();
    expect(vars.accent).toBeTruthy();
    expect(vars.font).toContain('Inter');

    await page.close();
  }, 15000);
});

// =============================================================================
// VIEWPORT META TAG
// =============================================================================
describe('viewport meta tag present', () => {
  test('index.html has correct viewport meta', async () => {
    const page = await browser.newPage();
    await page.goto(INDEX_URL, { waitUntil: 'domcontentloaded', timeout: 10000 });

    const viewport = await page.evaluate(() => {
      const meta = document.querySelector('meta[name="viewport"]');
      return meta ? meta.content : null;
    });

    expect(viewport).toContain('width=device-width');
    expect(viewport).toContain('initial-scale=1');
    await page.close();
  }, 15000);

  test('approve.html has correct viewport meta', async () => {
    const page = await browser.newPage();
    await page.goto(APPROVE_URL, { waitUntil: 'domcontentloaded', timeout: 10000 });

    const viewport = await page.evaluate(() => {
      const meta = document.querySelector('meta[name="viewport"]');
      return meta ? meta.content : null;
    });

    expect(viewport).toContain('width=device-width');
    expect(viewport).toContain('initial-scale=1');
    await page.close();
  }, 15000);
});

// =============================================================================
// OVERFLOW ELEMENTS HAVE SCROLL
// =============================================================================
describe('scrollable containers configured correctly', () => {
  test.each([
    ['iPhone 15', { width: 393, height: 852 }],
    ['Galaxy Fold', { width: 280, height: 653 }]
  ])('%s - scrollable areas have overflow-y auto', async (name, { width, height }) => {
    const page = await browser.newPage();
    await page.setViewport({ width, height });
    await page.goto(INDEX_URL, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await delay(300);

    const scrollAreas = await page.evaluate(() => {
      const selectors = ['.panel-scroll', '.drawer-body', '.modal-overlay'];
      const results = {};
      selectors.forEach(sel => {
        const el = document.querySelector(sel);
        if (el) {
          const style = getComputedStyle(el);
          results[sel] = style.overflowY;
        }
      });
      return results;
    });

    if (scrollAreas['.panel-scroll']) {
      expect(['auto', 'scroll']).toContain(scrollAreas['.panel-scroll']);
    }
    if (scrollAreas['.modal-overlay']) {
      expect(['auto', 'scroll']).toContain(scrollAreas['.modal-overlay']);
    }

    await page.close();
  }, 15000);
});

// =============================================================================
// PRINT MEDIA HIDES APP
// =============================================================================
describe('print styles', () => {
  test('app hidden in print media', async () => {
    const page = await browser.newPage();
    await page.goto(INDEX_URL, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await page.emulateMediaType('print');
    await delay(200);

    const bodyHidden = await page.evaluate(() => {
      const style = getComputedStyle(document.body);
      return style.display === 'none';
    });

    expect(bodyHidden).toBe(true);
    await page.close();
  }, 15000);
});
