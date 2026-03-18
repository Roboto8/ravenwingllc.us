// === Extracted BOM data and calculation functions for testability ===
// This mirrors the BOM data and calculateBOM() from app.js

const BOM = {
  wood: {
    postSpacing: 8,
    heights: {
      4: {
        postLength: '4x4x6 PT', postCost: 12, rails: 2, railDesc: '2x4x8 PT', railCost: 6,
        pickets: 17, picketDesc: '1x6x4 dog ear PT', picketCost: 2.25,
        screwsPerPicket: 4, concreteBags: 2, brackets: 2
      },
      6: {
        postLength: '4x4x8 PT', postCost: 16, rails: 3, railDesc: '2x4x8 PT', railCost: 6,
        pickets: 17, picketDesc: '1x6x6 dog ear PT', picketCost: 3,
        screwsPerPicket: 6, concreteBags: 2, brackets: 3
      },
      8: {
        postLength: '6x6x12 PT', postCost: 42, rails: 4, railDesc: '2x4x8 PT', railCost: 6,
        pickets: 17, picketDesc: '1x6x8 dog ear PT', picketCost: 5.50,
        screwsPerPicket: 8, concreteBags: 4, brackets: 4
      }
    },
    extras: { postCapCost: 4, concreteBagCost: 6, screwBoxCost: 10, screwsPerBox: 100, bracketCost: 1.50 }
  },
  vinyl: {
    postSpacing: 8,
    heights: {
      4: {
        postLength: '5x5x7 vinyl', postCost: 24, rails: 2, railDesc: 'Vinyl rail', railCost: 0,
        panels: 1, panelDesc: '4ft privacy panel (8ft)', panelCost: 50,
        concreteBags: 2, screws: 6
      },
      6: {
        postLength: '5x5x9 vinyl', postCost: 29, rails: 0, railDesc: '', railCost: 0,
        panels: 1, panelDesc: '6ft privacy panel (8ft)', panelCost: 65,
        concreteBags: 2, screws: 6
      },
      8: {
        postLength: '5x5x11 vinyl', postCost: 38, rails: 0, railDesc: '', railCost: 0,
        panels: 1, panelDesc: '8ft privacy panel (8ft)', panelCost: 105,
        concreteBags: 3, screws: 8
      }
    },
    extras: { postCapCost: 3.50, concreteBagCost: 6, screwBoxCost: 8, screwsPerBox: 50, stiffenerCost: 25, stiffenerDesc: 'Aluminum post stiffener' }
  },
  'chain-link': {
    postSpacing: 10,
    heights: {
      4: {
        linePostDesc: '1-5/8" x 6ft line post', linePostCost: 16,
        termPostDesc: '2-3/8" x 6ft terminal post', termPostCost: 22,
        topRailDesc: '1-3/8" top rail (21ft)', topRailCost: 16, topRailLength: 21,
        fabricDesc: '4ft x 50ft 11.5ga galv mesh', fabricCost: 95, fabricLength: 50,
        tensionBandsPerTerm: 3, braceBandsPerTerm: 2, concreteBags: 2,
        tieWiresPerPost: 4, tieWiresPerRailFt: 0.5
      },
      6: {
        linePostDesc: '1-7/8" x 8ft line post', linePostCost: 20,
        termPostDesc: '2-3/8" x 8ft terminal post', termPostCost: 28,
        topRailDesc: '1-3/8" top rail (21ft)', topRailCost: 20, topRailLength: 21,
        fabricDesc: '6ft x 50ft 11ga galv mesh', fabricCost: 160, fabricLength: 50,
        tensionBandsPerTerm: 5, braceBandsPerTerm: 2, concreteBags: 2,
        tieWiresPerPost: 5, tieWiresPerRailFt: 0.5
      },
      8: {
        linePostDesc: '1-7/8" x 10ft line post', linePostCost: 26,
        termPostDesc: '2-3/8" x 10ft terminal post', termPostCost: 35,
        topRailDesc: '1-3/8" top rail (21ft)', topRailCost: 20, topRailLength: 21,
        fabricDesc: '8ft x 50ft 11ga galv mesh', fabricCost: 350, fabricLength: 50,
        tensionBandsPerTerm: 7, braceBandsPerTerm: 2, concreteBags: 3,
        tieWiresPerPost: 7, tieWiresPerRailFt: 0.5
      }
    },
    extras: {
      tensionBarCost: 6, tensionBandCost: 1.50, braceBandCost: 2, railEndCost: 2.50,
      loopCapCost: 1.50, domeCapCost: 2, tieWireCost: 0.15,
      carriageBoltCost: 0.50, concreteBagCost: 6, tensionWireCost: 0.25
    }
  },
  aluminum: {
    postSpacing: 6,
    heights: {
      4: {
        postDesc: '2x2 x 6.5ft aluminum', postCost: 28,
        panelDesc: '4ft x 6ft aluminum panel', panelCost: 85,
        screws: 4, concreteBags: 1
      },
      6: {
        postDesc: '2x2 x 8.5ft aluminum', postCost: 36,
        panelDesc: '6ft x 6ft aluminum panel', panelCost: 140,
        screws: 4, concreteBags: 2
      },
      8: {
        postDesc: '2x2 x 10.5ft aluminum', postCost: 48,
        panelDesc: '8ft x 6ft aluminum panel', panelCost: 195,
        screws: 4, concreteBags: 2
      }
    },
    extras: { postCapCost: 8, concreteBagCost: 6, screwCost: 0.25, bracketCost: 4, bracketsPerPanel: 4 }
  },
  iron: {
    postSpacing: 8,
    heights: {
      4: {
        postDesc: '2x2 x 7ft steel', postCost: 35,
        panelDesc: '4ft x 8ft iron panel', panelCost: 250,
        screws: 8, concreteBags: 2
      },
      6: {
        postDesc: '2.5x2.5 x 9ft steel', postCost: 48,
        panelDesc: '6ft x 8ft iron panel', panelCost: 400,
        screws: 10, concreteBags: 3
      },
      8: {
        postDesc: '2.5x2.5 x 11ft steel', postCost: 62,
        panelDesc: '8ft x 8ft iron panel', panelCost: 550,
        screws: 12, concreteBags: 3
      }
    },
    extras: { postCapCost: 8, concreteBagCost: 6, bracketCost: 5, bracketsPerPanel: 4, screwCost: 0.30 }
  }
};

/**
 * Calculate Bill of Materials for a fence.
 * @param {number} feet - linear feet of fence
 * @param {string} fenceType - wood|vinyl|chain-link|aluminum|iron
 * @param {number} height - 4|6|8
 * @param {object} [options] - optional overrides
 * @param {object} [options.customPricing] - custom pricing map (path -> value)
 * @param {boolean} [options.fenceClosed] - whether fence is closed loop
 * @param {number} [options.fencePointCount] - number of fence points (for chain-link corner calc)
 */
function calculateBOM(feet, fenceType, height, options = {}) {
  const customPricing = options.customPricing || {};
  const fenceClosed = options.fenceClosed || false;
  const fencePointCount = options.fencePointCount || 2;

  const spec = BOM[fenceType];
  if (!spec || !spec.heights[height]) return null;

  const h = spec.heights[height];
  const ex = spec.extras;
  const sections = Math.max(0, Math.ceil(feet / spec.postSpacing));
  const posts = sections + 1;
  const items = [];
  let materialTotal = 0;

  function p(key, fallback) { const path = fenceType+'.'+height+'.'+key; return customPricing[path] !== undefined ? customPricing[path] : fallback; }
  function pe(key, fallback) { const path = fenceType+'.extra.'+key; return customPricing[path] !== undefined ? customPricing[path] : fallback; }

  if (fenceType === 'wood') {
    const totalPickets = sections * h.pickets;
    const totalRails = sections * h.rails;
    const totalBrackets = sections * h.brackets * 2;
    const totalScrews = totalPickets * h.screwsPerPicket + totalBrackets * 2;
    const screwBoxes = Math.ceil(totalScrews / ex.screwsPerBox);
    const totalConcrete = posts * h.concreteBags;

    items.push({ name: h.postLength + ' posts', qty: posts, unit: 'ea', unitCost: p('postCost', h.postCost) });
    items.push({ name: h.railDesc + ' rails', qty: totalRails, unit: 'ea', unitCost: p('railCost', h.railCost) });
    items.push({ name: h.picketDesc + ' pickets', qty: totalPickets, unit: 'ea', unitCost: p('picketCost', h.picketCost) });
    items.push({ name: 'Rail brackets', qty: totalBrackets, unit: 'ea', unitCost: pe('bracketCost', ex.bracketCost) });
    items.push({ name: 'Post caps', qty: posts, unit: 'ea', unitCost: pe('postCapCost', ex.postCapCost) });
    items.push({ name: '50lb concrete bags', qty: totalConcrete, unit: 'bags', unitCost: pe('concreteBagCost', ex.concreteBagCost) });
    items.push({ name: 'Exterior deck screws (box)', qty: screwBoxes, unit: 'boxes', unitCost: pe('screwBoxCost', ex.screwBoxCost) });
  }
  else if (fenceType === 'vinyl') {
    const totalScrews = sections * h.screws;
    const screwBoxes = Math.ceil(totalScrews / ex.screwsPerBox);
    const totalConcrete = posts * h.concreteBags;

    items.push({ name: h.postLength + ' posts', qty: posts, unit: 'ea', unitCost: p('postCost', h.postCost) });
    items.push({ name: h.panelDesc, qty: sections, unit: 'ea', unitCost: p('panelCost', h.panelCost) });
    items.push({ name: ex.stiffenerDesc, qty: posts, unit: 'ea', unitCost: pe('stiffenerCost', ex.stiffenerCost) });
    items.push({ name: 'Post caps', qty: posts, unit: 'ea', unitCost: pe('postCapCost', ex.postCapCost) });
    items.push({ name: '50lb concrete bags', qty: totalConcrete, unit: 'bags', unitCost: pe('concreteBagCost', ex.concreteBagCost) });
    items.push({ name: 'Self-tapping screws (box)', qty: screwBoxes, unit: 'boxes', unitCost: pe('screwBoxCost', ex.screwBoxCost) });
  }
  else if (fenceType === 'chain-link') {
    const corners = fenceClosed ? fencePointCount : Math.max(0, fencePointCount - 2);
    const totalTerminals = 2 + corners;
    const totalLinePosts = Math.max(0, posts - totalTerminals);
    const fabricRolls = Math.ceil(feet / h.fabricLength);
    const topRails = Math.ceil(feet / h.topRailLength);
    const totalConcrete = posts * h.concreteBags;
    const tensionBars = totalTerminals;
    const tensionBands = totalTerminals * h.tensionBandsPerTerm;
    const braceBands = totalTerminals * h.braceBandsPerTerm;
    const railEnds = totalTerminals;
    const loopCaps = totalLinePosts;
    const domeCaps = totalTerminals;
    const bolts = tensionBands + braceBands;
    const tieWires = totalLinePosts * h.tieWiresPerPost + Math.round(feet * h.tieWiresPerRailFt);

    items.push({ name: h.linePostDesc, qty: totalLinePosts, unit: 'ea', unitCost: p('linePostCost', h.linePostCost) });
    items.push({ name: h.termPostDesc, qty: totalTerminals, unit: 'ea', unitCost: p('termPostCost', h.termPostCost) });
    items.push({ name: h.topRailDesc, qty: topRails, unit: 'ea', unitCost: p('topRailCost', h.topRailCost) });
    items.push({ name: h.fabricDesc, qty: fabricRolls, unit: 'rolls', unitCost: p('fabricCost', h.fabricCost) });
    items.push({ name: 'Tension bars', qty: tensionBars, unit: 'ea', unitCost: pe('tensionBarCost', ex.tensionBarCost) });
    items.push({ name: 'Tension bands', qty: tensionBands, unit: 'ea', unitCost: pe('tensionBandCost', ex.tensionBandCost) });
    items.push({ name: 'Brace bands', qty: braceBands, unit: 'ea', unitCost: pe('braceBandCost', ex.braceBandCost) });
    items.push({ name: 'Rail end cups', qty: railEnds, unit: 'ea', unitCost: pe('railEndCost', ex.railEndCost) });
    items.push({ name: 'Loop caps (line)', qty: loopCaps, unit: 'ea', unitCost: pe('loopCapCost', ex.loopCapCost) });
    items.push({ name: 'Dome caps (terminal)', qty: domeCaps, unit: 'ea', unitCost: pe('domeCapCost', ex.domeCapCost) });
    items.push({ name: '5/16" carriage bolts', qty: bolts, unit: 'ea', unitCost: pe('carriageBoltCost', ex.carriageBoltCost) });
    items.push({ name: 'Tie wires', qty: tieWires, unit: 'ea', unitCost: pe('tieWireCost', ex.tieWireCost) });
    items.push({ name: '50lb concrete bags', qty: totalConcrete, unit: 'bags', unitCost: pe('concreteBagCost', ex.concreteBagCost) });
  }
  else if (fenceType === 'aluminum') {
    const totalBrackets = sections * ex.bracketsPerPanel;
    const totalScrews = sections * h.screws + totalBrackets;
    const totalConcrete = posts * h.concreteBags;

    items.push({ name: h.postDesc + ' posts', qty: posts, unit: 'ea', unitCost: p('postCost', h.postCost) });
    items.push({ name: h.panelDesc, qty: sections, unit: 'ea', unitCost: p('panelCost', h.panelCost) });
    items.push({ name: 'Mounting brackets', qty: totalBrackets, unit: 'ea', unitCost: pe('bracketCost', ex.bracketCost) });
    items.push({ name: 'Post caps', qty: posts, unit: 'ea', unitCost: pe('postCapCost', ex.postCapCost) });
    items.push({ name: 'SS self-tapping screws', qty: totalScrews, unit: 'ea', unitCost: pe('screwCost', ex.screwCost) });
    items.push({ name: '50lb concrete bags', qty: totalConcrete, unit: 'bags', unitCost: pe('concreteBagCost', ex.concreteBagCost) });
  }
  else if (fenceType === 'iron') {
    const totalBrackets = sections * ex.bracketsPerPanel;
    const totalScrews = sections * h.screws + totalBrackets * 2;
    const totalConcrete = posts * h.concreteBags;

    items.push({ name: h.postDesc + ' posts', qty: posts, unit: 'ea', unitCost: p('postCost', h.postCost) });
    items.push({ name: h.panelDesc, qty: sections, unit: 'ea', unitCost: p('panelCost', h.panelCost) });
    items.push({ name: 'Mounting brackets', qty: totalBrackets, unit: 'ea', unitCost: pe('bracketCost', ex.bracketCost) });
    items.push({ name: 'Post caps', qty: posts, unit: 'ea', unitCost: pe('postCapCost', ex.postCapCost) });
    items.push({ name: 'Bolts/screws', qty: totalScrews, unit: 'ea', unitCost: pe('screwCost', ex.screwCost) });
    items.push({ name: '50lb concrete bags', qty: totalConcrete, unit: 'bags', unitCost: pe('concreteBagCost', ex.concreteBagCost) });
  }

  const filtered = items.filter(i => i.qty > 0).map(i => {
    i.total = Math.round(i.qty * i.unitCost * 100) / 100;
    materialTotal += i.total;
    return i;
  });

  return { items: filtered, materialTotal: Math.round(materialTotal) };
}

/**
 * Catmull-Rom spline interpolation between 4 points at parameter t.
 */
function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return {
    lat: 0.5 * ((2*p1.lat) + (-p0.lat+p2.lat)*t + (2*p0.lat-5*p1.lat+4*p2.lat-p3.lat)*t2 + (-p0.lat+3*p1.lat-3*p2.lat+p3.lat)*t3),
    lng: 0.5 * ((2*p1.lng) + (-p0.lng+p2.lng)*t + (2*p0.lng-5*p1.lng+4*p2.lng-p3.lng)*t2 + (-p0.lng+3*p1.lng-3*p2.lng+p3.lng)*t3)
  };
}

/**
 * Generate spline points from control points.
 */
function getSplinePoints(points, closed) {
  if (points.length < 3) return points;

  const pts = closed ? [...points, points[0], points[1]] : points;
  const result = [];
  const segments = 12;

  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[Math.min(pts.length - 1, i + 1)];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];

    for (let t = 0; t < segments; t++) {
      const pt = catmullRom(p0, p1, p2, p3, t / segments);
      result.push({ lat: pt.lat, lng: pt.lng });
    }
  }
  if (!closed) result.push(pts[pts.length - 1]);

  return result;
}

/**
 * Calculate total footage from a set of points.
 * @param {Array} points - array of {lat, lng} with distanceTo method
 * @param {boolean} closed - whether the fence loop is closed
 * @param {boolean} curveMode - whether curve mode is on
 * @returns {number} total feet
 */
function calculateFootage(points, closed, curveMode) {
  let totalMeters = 0;

  if (curveMode && points.length >= 3) {
    const spline = getSplinePoints(points, closed);
    for (let i = 1; i < spline.length; i++) {
      totalMeters += distBetween(spline[i - 1], spline[i]);
    }
  } else {
    for (let i = 1; i < points.length; i++) {
      totalMeters += distBetween(points[i - 1], points[i]);
    }
    if (closed && points.length > 2) {
      totalMeters += distBetween(points[points.length - 1], points[0]);
    }
  }

  return Math.round(totalMeters * 3.28084);
}

/**
 * Haversine distance between two lat/lng points (in meters).
 */
function distBetween(p1, p2) {
  const R = 6371000;
  const dLat = (p2.lat - p1.lat) * Math.PI / 180;
  const dLng = (p2.lng - p1.lng) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(p1.lat * Math.PI / 180) * Math.cos(p2.lat * Math.PI / 180) *
    Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

/**
 * Get price with custom override support.
 */
function getPrice(fenceType, height, key, fallback, customPricing) {
  const path = fenceType + '.' + height + '.' + key;
  if (customPricing && customPricing[path] !== undefined) return customPricing[path];
  return fallback;
}

/**
 * Encode estimate data for share URL.
 */
function encodeEstimate(data) {
  return Buffer.from(JSON.stringify(data)).toString('base64');
}

/**
 * Decode estimate data from share URL.
 */
function decodeEstimate(encoded) {
  return JSON.parse(Buffer.from(encoded, 'base64').toString());
}

/**
 * Calculate custom items total.
 */
function customItemsTotal(items) {
  if (!items || !items.length) return 0;
  return items.reduce((sum, i) => sum + ((i.qty || 0) * (i.unitCost || 0)), 0);
}

// === Mulch Data ===
const MULCH = {
  hardwood: { name: 'Hardwood Mulch', bagCuFt: 2, bagCost: 4.50, bulkCuYdCost: 35 },
  cedar: { name: 'Cedar Mulch', bagCuFt: 2, bagCost: 5.50, bulkCuYdCost: 45 },
  cypress: { name: 'Cypress Mulch', bagCuFt: 2, bagCost: 5.00, bulkCuYdCost: 40 },
  'pine-bark': { name: 'Pine Bark Mulch', bagCuFt: 2, bagCost: 4.00, bulkCuYdCost: 30 },
  'dyed-black': { name: 'Dyed Black Mulch', bagCuFt: 2, bagCost: 4.75, bulkCuYdCost: 38 },
  'dyed-red': { name: 'Dyed Red Mulch', bagCuFt: 2, bagCost: 4.75, bulkCuYdCost: 38 },
  rubber: { name: 'Rubber Mulch', bagCuFt: 0.8, bagCost: 8.00, bulkCuYdCost: 120 },
  'river-rock': { name: 'River Rock', bagCuFt: 0.5, bagCost: 6.00, bulkCuYdCost: 75, isRock: true },
  'pea-gravel': { name: 'Pea Gravel', bagCuFt: 0.5, bagCost: 5.50, bulkCuYdCost: 50, isRock: true },
  'lava-rock': { name: 'Lava Rock', bagCuFt: 0.5, bagCost: 7.00, bulkCuYdCost: 110, isRock: true }
};

/**
 * Calculate polygon area in square feet from lat/lng points using the Shoelace formula.
 * Projects to local meters first to account for earth curvature.
 */
function calculatePolygonArea(points) {
  if (points.length < 3) return 0;

  // Convert lat/lng to local x/y meters using first point as origin
  var origin = points[0];
  var cosLat = Math.cos(origin.lat * Math.PI / 180);
  var metersPerDegLat = 111320;
  var metersPerDegLng = 111320 * cosLat;

  var xy = points.map(function(p) {
    return {
      x: (p.lng - origin.lng) * metersPerDegLng,
      y: (p.lat - origin.lat) * metersPerDegLat
    };
  });

  // Shoelace formula
  var area = 0;
  for (var i = 0; i < xy.length; i++) {
    var j = (i + 1) % xy.length;
    area += xy[i].x * xy[j].y;
    area -= xy[j].x * xy[i].y;
  }
  area = Math.abs(area) / 2;

  // Convert square meters to square feet
  return Math.round(area * 10.7639);
}

/**
 * Calculate polygon perimeter in feet from lat/lng points.
 */
function calculatePolygonPerimeter(points) {
  if (points.length < 2) return 0;
  var total = 0;
  for (var i = 0; i < points.length; i++) {
    var j = (i + 1) % points.length;
    total += distBetween(points[i], points[j]);
  }
  return Math.round(total * 3.28084);
}

/**
 * Calculate Bill of Materials for mulch.
 * @param {number} areaSqFt - area in square feet
 * @param {string} materialType - key from MULCH object
 * @param {number} depthInches - depth in inches (2, 3, 4)
 * @param {object} [options]
 * @param {string} [options.deliveryMode] - 'bags' or 'bulk'
 * @param {boolean} [options.addFabric] - include landscape fabric
 * @param {number} [options.perimeterFt] - perimeter for edging calculation
 * @param {boolean} [options.addEdging] - include landscape edging
 * @param {object} [options.customPricing] - custom pricing overrides
 */
function calculateMulchBOM(areaSqFt, materialType, depthInches, options) {
  options = options || {};
  var deliveryMode = options.deliveryMode || 'bags';
  var customPricing = options.customPricing || {};

  var mat = MULCH[materialType];
  if (!mat) return null;

  var cubicFeet = (areaSqFt * depthInches) / 12;
  var cubicYards = cubicFeet / 27;
  var items = [];
  var materialTotal = 0;

  function mp(key, fallback) {
    var path = 'mulch.' + materialType + '.' + key;
    return customPricing[path] !== undefined ? customPricing[path] : fallback;
  }

  if (deliveryMode === 'bulk') {
    var yds = Math.ceil(cubicYards * 10) / 10; // round up to nearest 0.1
    items.push({
      name: mat.name + ' (bulk)',
      qty: yds,
      unit: 'cu yd',
      unitCost: mp('bulkCuYdCost', mat.bulkCuYdCost)
    });
  } else {
    var bags = Math.ceil(cubicFeet / mat.bagCuFt);
    items.push({
      name: mat.name + ' (' + mat.bagCuFt + ' cu ft bags)',
      qty: bags,
      unit: 'bags',
      unitCost: mp('bagCost', mat.bagCost)
    });
  }

  if (options.addFabric) {
    // Landscape fabric comes in 3ft x 50ft rolls = 150 sq ft
    var fabricRolls = Math.ceil(areaSqFt / 150);
    items.push({
      name: 'Landscape fabric (3x50ft)',
      qty: fabricRolls,
      unit: 'rolls',
      unitCost: mp('fabricCost', 18)
    });
    // Fabric staples — 1 per 2 sq ft
    var staples = Math.ceil(areaSqFt / 2);
    var staplePacks = Math.ceil(staples / 75);
    items.push({
      name: 'Fabric staples (75-pack)',
      qty: staplePacks,
      unit: 'packs',
      unitCost: mp('stapleCost', 8)
    });
  }

  if (options.addEdging && options.perimeterFt) {
    // Landscape edging in 20ft sections
    var edgingSections = Math.ceil(options.perimeterFt / 20);
    items.push({
      name: 'Landscape edging (20ft)',
      qty: edgingSections,
      unit: 'ea',
      unitCost: mp('edgingCost', 12)
    });
    // Stakes — 1 per 3 ft
    var stakes = Math.ceil(options.perimeterFt / 3);
    items.push({
      name: 'Edging stakes',
      qty: stakes,
      unit: 'ea',
      unitCost: mp('stakeCost', 1.50)
    });
  }

  var filtered = items.filter(function(i) { return i.qty > 0; }).map(function(i) {
    i.total = Math.round(i.qty * i.unitCost * 100) / 100;
    materialTotal += i.total;
    return i;
  });

  return { items: filtered, materialTotal: Math.round(materialTotal), cubicYards: Math.round(cubicYards * 10) / 10 };
}

module.exports = {
  BOM,
  MULCH,
  calculateBOM,
  calculateMulchBOM,
  calculatePolygonArea,
  calculatePolygonPerimeter,
  catmullRom,
  getSplinePoints,
  calculateFootage,
  distBetween,
  getPrice,
  encodeEstimate,
  decodeEstimate,
  customItemsTotal
};
