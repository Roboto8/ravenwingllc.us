// === State ===
let map;
let currentTool = 'draw';
let curveMode = false;
let fencePoints = [];
let fenceLine = null;
let fenceMarkers = [];
let segmentLabels = [];
let fenceClosed = false;
let closingLine = null;
let closingLabel = null;
let gates = [];
let gateMarkers = [];
let customItems = [];
let selectedFence = { type: 'wood', price: 25 };
let selectedHeight = 6;
let terrainMultiplier = 1.0;

// === Custom Pricing (overrides BOM defaults) ===
let customPricing = JSON.parse(localStorage.getItem('fc_pricing') || '{}');

function saveCustomPricing() {
  localStorage.setItem('fc_pricing', JSON.stringify(customPricing));
}

function getPrice(fenceType, height, key, fallback) {
  const path = fenceType + '.' + height + '.' + key;
  if (customPricing[path] !== undefined) return customPricing[path];
  return fallback;
}

// === Map Init ===
let baseLayers = {};

function initMap() {
  map = L.map('map', {
    center: [37.6068, -77.3732],
    zoom: 18,
    zoomControl: false
  });

  baseLayers.satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 22,
    maxNativeZoom: 20,
    attribution: 'Tiles &copy; Esri'
  });

  baseLayers.streets = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 22,
    maxNativeZoom: 19,
    attribution: '&copy; OpenStreetMap'
  });

  baseLayers.topo = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 22,
    maxNativeZoom: 20,
    attribution: 'Tiles &copy; Esri'
  });

  baseLayers.hybrid = L.layerGroup([
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 22, maxNativeZoom: 20 }),
    L.tileLayer('https://stamen-tiles.a.ssl.fastly.net/toner-labels/{z}/{x}/{y}.png', { maxZoom: 22, maxNativeZoom: 20, opacity: 0.7 })
  ]);

  baseLayers.satellite.addTo(map);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  map.on('click', onMapClick);
}

function setMapLayer(layerName) {
  Object.values(baseLayers).forEach(layer => {
    if (map.hasLayer(layer)) map.removeLayer(layer);
  });
  baseLayers[layerName].addTo(map);
  document.querySelectorAll('.layer-btn').forEach(b => b.classList.remove('active'));
  const btn = document.querySelector(`.layer-btn[data-layer="${layerName}"]`);
  if (btn) btn.classList.add('active');
}

function onMapClick(e) {
  if (currentTool === 'draw' && !fenceClosed) {
    addFencePoint(e.latlng);
  } else if (currentTool === 'gate') {
    addGate(e.latlng);
  }
}

// === Segment Labels ===
function createSegmentLabel(p1, p2) {
  const meters = p1.distanceTo(p2);
  const feet = Math.round(meters * 3.28084);
  const midLat = (p1.lat + p2.lat) / 2;
  const midLng = (p1.lng + p2.lng) / 2;

  const label = L.marker([midLat, midLng], {
    icon: L.divIcon({
      className: 'segment-label',
      html: '<div class="seg-label">' + feet + ' ft</div>',
      iconSize: [60, 20],
      iconAnchor: [30, 10]
    }),
    interactive: false
  }).addTo(map);

  return label;
}

function redrawSegmentLabels() {
  segmentLabels.forEach(l => map.removeLayer(l));
  segmentLabels = [];

  for (let i = 1; i < fencePoints.length; i++) {
    segmentLabels.push(createSegmentLabel(fencePoints[i - 1], fencePoints[i]));
  }
}

// === Fence Drawing ===
function addFencePoint(latlng) {
  fencePoints.push(latlng);

  const idx = fencePoints.length - 1;
  const marker = L.marker(latlng, {
    draggable: true,
    icon: L.divIcon({
      className: 'fence-vertex',
      iconSize: [22, 22],
      iconAnchor: [11, 11]
    })
  }).addTo(map);

  marker.on('drag', function(e) {
    fencePoints[idx] = e.target.getLatLng();
    redrawFenceLine();
    redrawSegmentLabels();
    updateFootage();
    recalculate();
  });

  marker.on('dragend', function() {
    redrawSegmentLabels();
    updateFootage();
    recalculate();
  });

  fenceMarkers.push(marker);

  redrawFenceLine();
  redrawSegmentLabels();
  updateCloseButton();
  updateMidpointHandles();
  updateFootage();
  recalculate();
}

// === Curve Interpolation (Catmull-Rom spline) ===
function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return {
    lat: 0.5 * ((2*p1.lat) + (-p0.lat+p2.lat)*t + (2*p0.lat-5*p1.lat+4*p2.lat-p3.lat)*t2 + (-p0.lat+3*p1.lat-3*p2.lat+p3.lat)*t3),
    lng: 0.5 * ((2*p1.lng) + (-p0.lng+p2.lng)*t + (2*p0.lng-5*p1.lng+4*p2.lng-p3.lng)*t2 + (-p0.lng+3*p1.lng-3*p2.lng+p3.lng)*t3)
  };
}

function getSplinePoints(points, closed) {
  if (points.length < 3) return points;

  const pts = closed ? [...points, points[0], points[1]] : points;
  const result = [];
  const segments = 12; // points per segment

  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[Math.min(pts.length - 1, i + 1)];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];

    for (let t = 0; t < segments; t++) {
      const pt = catmullRom(p0, p1, p2, p3, t / segments);
      result.push(L.latLng(pt.lat, pt.lng));
    }
  }
  // Add last point
  if (!closed) result.push(pts[pts.length - 1]);

  return result;
}

function redrawFenceLine() {
  if (fenceLine) map.removeLayer(fenceLine);
  fenceLine = null;

  const raw = fenceClosed ? [...fencePoints, fencePoints[0]] : fencePoints;
  const pts = curveMode && fencePoints.length >= 3 ? getSplinePoints(fencePoints, fenceClosed) : raw;

  if (pts.length > 1) {
    fenceLine = L.polyline(pts, {
      color: '#c0622e',
      weight: 4,
      opacity: 0.9,
      dashArray: fenceClosed ? null : '8, 8'
    }).addTo(map);
  }
}

function toggleCurve() {
  curveMode = !curveMode;
  const btn = document.getElementById('curve-btn');
  if (btn) btn.classList.toggle('active', curveMode);
  redrawFenceLine();
  updateMidpointHandles();
  updateFootage();
  recalculate();
}

// === Midpoint insertion — click near a segment to add a control point ===
function insertMidpoint(afterIndex) {
  if (afterIndex < 0 || afterIndex >= fencePoints.length - 1) return;

  const p1 = fencePoints[afterIndex];
  const p2 = fencePoints[afterIndex + 1];
  const mid = L.latLng((p1.lat + p2.lat) / 2, (p1.lng + p2.lng) / 2);

  // Insert point
  fencePoints.splice(afterIndex + 1, 0, mid);

  // Rebuild all markers
  rebuildAllMarkers();
  redrawFenceLine();
  redrawSegmentLabels();
  updateCloseButton();
  updateFootage();
  recalculate();
}

function rebuildAllMarkers() {
  fenceMarkers.forEach(m => map.removeLayer(m));
  fenceMarkers = [];

  fencePoints.forEach((latlng, idx) => {
    const marker = L.marker(latlng, {
      draggable: true,
      icon: L.divIcon({
        className: 'fence-vertex',
        iconSize: [22, 22],
        iconAnchor: [11, 11]
      })
    }).addTo(map);

    marker.on('drag', function(e) {
      fencePoints[idx] = e.target.getLatLng();
      redrawFenceLine();
      redrawSegmentLabels();
      updateFootage();
      recalculate();
    });

    marker.on('dragend', function() {
      redrawSegmentLabels();
      updateFootage();
      recalculate();
    });

    fenceMarkers.push(marker);
  });
}

// Show midpoint handles on segments (clickable + icons between vertices)
let midpointMarkers = [];

function updateMidpointHandles() {
  midpointMarkers.forEach(m => map.removeLayer(m));
  midpointMarkers = [];

  if (!curveMode || fencePoints.length < 2) return;

  const limit = fenceClosed ? fencePoints.length : fencePoints.length - 1;
  for (let i = 0; i < limit; i++) {
    const p1 = fencePoints[i];
    const p2 = fencePoints[(i + 1) % fencePoints.length];
    const midLat = (p1.lat + p2.lat) / 2;
    const midLng = (p1.lng + p2.lng) / 2;

    const idx = i;
    const handle = L.marker([midLat, midLng], {
      icon: L.divIcon({
        className: 'midpoint-handle',
        iconSize: [12, 12],
        iconAnchor: [6, 6]
      }),
      interactive: true
    }).addTo(map);

    handle.on('click', function() {
      const insertIdx = idx >= fencePoints.length - 1 && fenceClosed ? fencePoints.length - 1 : idx;
      // Insert between idx and idx+1
      const p1 = fencePoints[idx];
      const nextIdx = (idx + 1) % fencePoints.length;
      const p2 = fencePoints[nextIdx];
      const mid = L.latLng((p1.lat + p2.lat) / 2, (p1.lng + p2.lng) / 2);

      fencePoints.splice(idx + 1, 0, mid);
      rebuildAllMarkers();
      redrawFenceLine();
      redrawSegmentLabels();
      updateMidpointHandles();
      updateCloseButton();
      updateFootage();
      recalculate();
    });

    midpointMarkers.push(handle);
  }
}

// === Close / Loop Fence ===
function closeFence() {
  if (fencePoints.length < 3) return;
  fenceClosed = true;

  redrawFenceLine();

  // Add label for closing segment
  segmentLabels.push(createSegmentLabel(fencePoints[fencePoints.length - 1], fencePoints[0]));

  updateCloseButton();
  updateMidpointHandles();
  updateFootage();
  recalculate();
}

function openFence() {
  fenceClosed = false;
  redrawFenceLine();
  redrawSegmentLabels();
  updateCloseButton();
  updateMidpointHandles();
  updateFootage();
  recalculate();
}

function updateCloseButton() {
  const btn = document.getElementById('close-btn');
  if (!btn) return;

  if (fencePoints.length < 3) {
    btn.style.display = 'none';
    return;
  }

  btn.style.display = 'flex';
  if (fenceClosed) {
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg> Open';
    btn.onclick = openFence;
  } else {
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg> Close';
    btn.onclick = closeFence;
  }
}

function updateFootage() {
  let totalMeters = 0;

  if (curveMode && fencePoints.length >= 3) {
    const spline = getSplinePoints(fencePoints, fenceClosed);
    for (let i = 1; i < spline.length; i++) {
      totalMeters += spline[i - 1].distanceTo(spline[i]);
    }
  } else {
    for (let i = 1; i < fencePoints.length; i++) {
      totalMeters += fencePoints[i - 1].distanceTo(fencePoints[i]);
    }
    if (fenceClosed && fencePoints.length > 2) {
      totalMeters += fencePoints[fencePoints.length - 1].distanceTo(fencePoints[0]);
    }
  }

  const totalFeet = Math.round(totalMeters * 3.28084);
  document.getElementById('total-feet').textContent = totalFeet.toLocaleString();
  return totalFeet;
}

// === Gates ===
function addGate(latlng) {
  const gateId = Date.now();
  const gate = { id: gateId, latlng, type: 'single', price: 350 };
  gates.push(gate);

  const marker = L.marker(latlng, {
    icon: L.divIcon({
      className: 'gate-marker',
      html: '<div style="background:#c0622e;color:#fff;font-weight:700;font-size:10px;padding:2px 8px;border-radius:3px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.3);letter-spacing:0.5px;">GATE</div>',
      iconSize: [50, 20],
      iconAnchor: [25, 28]
    })
  }).addTo(map);
  gateMarkers.push({ id: gateId, marker });

  renderGates();
  recalculate();
  setTool('draw');
}

function renderGates() {
  const list = document.getElementById('gates-list');
  if (gates.length === 0) {
    list.innerHTML = '<p class="empty-state">Place gates by clicking the map</p>';
    return;
  }
  list.innerHTML = gates.map((g, i) => `
    <div class="gate-item">
      <span>Gate ${i + 1}</span>
      <select onchange="updateGateType(${g.id}, this.value)">
        <option value="single" ${g.type === 'single' ? 'selected' : ''}>Single ($350)</option>
        <option value="double" ${g.type === 'double' ? 'selected' : ''}>Double ($550)</option>
        <option value="sliding" ${g.type === 'sliding' ? 'selected' : ''}>Sliding ($800)</option>
      </select>
      <button class="gate-remove" onclick="removeGate(${g.id})">&#x2715;</button>
    </div>
  `).join('');
}

function updateGateType(id, type) {
  const gate = gates.find(g => g.id === id);
  if (gate) {
    gate.type = type;
    gate.price = type === 'single' ? 350 : type === 'double' ? 550 : 800;
    recalculate();
  }
}

function removeGate(id) {
  gates = gates.filter(g => g.id !== id);
  const gm = gateMarkers.find(g => g.id === id);
  if (gm) {
    map.removeLayer(gm.marker);
    gateMarkers = gateMarkers.filter(g => g.id !== id);
  }
  renderGates();
  recalculate();
}

// === Tools ===
function setTool(tool) {
  currentTool = tool;
  document.querySelectorAll('.tool-btn:not(#close-btn)').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById(tool + '-btn');
  if (btn) btn.classList.add('active');

  map.getContainer().style.cursor = tool === 'draw' ? 'crosshair' : tool === 'gate' ? 'cell' : '';
}

function undoLast() {
  if (fenceClosed) {
    openFence();
    return;
  }
  if (fencePoints.length > 0) {
    fencePoints.pop();
    const marker = fenceMarkers.pop();
    if (marker) map.removeLayer(marker);

    // Rebind drag handlers with correct indices
    rebindMarkerDrags();

    redrawFenceLine();
    redrawSegmentLabels();
    updateCloseButton();
    updateMidpointHandles();
    updateFootage();
    recalculate();
  }
}

function rebindMarkerDrags() {
  fenceMarkers.forEach((marker, idx) => {
    marker.off('drag');
    marker.off('dragend');
    marker.on('drag', function(e) {
      fencePoints[idx] = e.target.getLatLng();
      redrawFenceLine();
      redrawSegmentLabels();
      updateFootage();
      recalculate();
    });
    marker.on('dragend', function() {
      redrawSegmentLabels();
      updateFootage();
      recalculate();
    });
  });
}

function clearAll() {
  fencePoints = [];
  fenceMarkers.forEach(m => map.removeLayer(m));
  fenceMarkers = [];
  segmentLabels.forEach(l => map.removeLayer(l));
  segmentLabels = [];
  if (fenceLine) map.removeLayer(fenceLine);
  fenceLine = null;
  fenceClosed = false;

  gates = [];
  gateMarkers.forEach(g => map.removeLayer(g.marker));
  gateMarkers = [];
  renderGates();

  midpointMarkers.forEach(m => map.removeLayer(m));
  midpointMarkers = [];

  updateCloseButton();
  updateMidpointHandles();
  updateFootage();
  recalculate();
}

// === Fence Selection ===
function selectFence(btn, type) {
  document.querySelectorAll('.fence-type-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  selectedFence = { type, price: parseInt(btn.dataset.price) };
  recalculate();
}

function selectHeight(btn, height) {
  btn.parentElement.querySelectorAll('.height-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  if (height) selectedHeight = height;
  recalculate();
}

function selectTerrain(btn, multiplier) {
  btn.parentElement.querySelectorAll('.height-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  terrainMultiplier = multiplier;
  recalculate();
}

// === BOM Data ===
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
        postLength: '4x4x8 PT', postCost: 14, rails: 3, railDesc: '2x4x8 PT', railCost: 6,
        pickets: 17, picketDesc: '1x6x6 dog ear PT', picketCost: 3,
        screwsPerPicket: 6, concreteBags: 2, brackets: 3
      },
      8: {
        postLength: '6x6x12 PT', postCost: 32, rails: 4, railDesc: '2x4x8 PT', railCost: 6,
        pickets: 17, picketDesc: '1x6x8 dog ear PT', picketCost: 5.50,
        screwsPerPicket: 8, concreteBags: 4, brackets: 4
      }
    },
    extras: { postCapCost: 4, concreteBagCost: 6, screwBoxCost: 10, screwsPerBox: 100, bracketCost: 3 }
  },
  vinyl: {
    postSpacing: 8,
    heights: {
      4: {
        postLength: '5x5x7 vinyl', postCost: 24, rails: 2, railDesc: 'Vinyl rail', railCost: 0,
        panels: 1, panelDesc: '4ft privacy panel (8ft)', panelCost: 42,
        concreteBags: 2, screws: 6
      },
      6: {
        postLength: '5x5x9 vinyl', postCost: 29, rails: 0, railDesc: '', railCost: 0,
        panels: 1, panelDesc: '6ft privacy panel (8ft)', panelCost: 52,
        concreteBags: 2, screws: 6
      },
      8: {
        postLength: '5x5x11 vinyl', postCost: 38, rails: 0, railDesc: '', railCost: 0,
        panels: 1, panelDesc: '8ft privacy panel (8ft)', panelCost: 78,
        concreteBags: 3, screws: 8
      }
    },
    extras: { postCapCost: 3.50, concreteBagCost: 6, screwBoxCost: 8, screwsPerBox: 50, stiffenerCost: 18, stiffenerDesc: 'Aluminum post stiffener' }
  },
  'chain-link': {
    postSpacing: 10,
    heights: {
      4: {
        linePostDesc: '1-5/8" x 6ft line post', linePostCost: 12,
        termPostDesc: '2-3/8" x 6ft terminal post', termPostCost: 18,
        topRailDesc: '1-3/8" top rail (21ft)', topRailCost: 16, topRailLength: 21,
        fabricDesc: '4ft x 50ft 11.5ga galv mesh', fabricCost: 95, fabricLength: 50,
        tensionBandsPerTerm: 3, braceBandsPerTerm: 2, concreteBags: 2,
        tieWiresPerPost: 4, tieWiresPerRailFt: 0.5
      },
      6: {
        linePostDesc: '1-7/8" x 8ft line post', linePostCost: 16,
        termPostDesc: '2-3/8" x 8ft terminal post', termPostCost: 24,
        topRailDesc: '1-3/8" top rail (21ft)', topRailCost: 16, topRailLength: 21,
        fabricDesc: '6ft x 50ft 11ga galv mesh', fabricCost: 160, fabricLength: 50,
        tensionBandsPerTerm: 5, braceBandsPerTerm: 2, concreteBags: 2,
        tieWiresPerPost: 5, tieWiresPerRailFt: 0.5
      },
      8: {
        linePostDesc: '1-7/8" x 10ft line post', linePostCost: 22,
        termPostDesc: '2-3/8" x 10ft terminal post', termPostCost: 30,
        topRailDesc: '1-3/8" top rail (21ft)', topRailCost: 16, topRailLength: 21,
        fabricDesc: '8ft x 50ft 11ga galv mesh', fabricCost: 280, fabricLength: 50,
        tensionBandsPerTerm: 7, braceBandsPerTerm: 2, concreteBags: 3,
        tieWiresPerPost: 7, tieWiresPerRailFt: 0.5
      }
    },
    extras: {
      tensionBarCost: 6, tensionBandCost: 1.50, braceBandCost: 2, railEndCost: 3,
      loopCapCost: 1.50, domeCapCost: 2, tieWireCost: 0.15,
      carriageBoltCost: 0.50, concreteBagCost: 6, tensionWireCost: 0.25
    }
  },
  aluminum: {
    postSpacing: 6,
    heights: {
      4: {
        postDesc: '2x2 x 6.5ft aluminum', postCost: 28,
        panelDesc: '4ft x 6ft aluminum panel', panelCost: 65,
        screws: 4, concreteBags: 1
      },
      6: {
        postDesc: '2x2 x 8.5ft aluminum', postCost: 36,
        panelDesc: '6ft x 6ft aluminum panel', panelCost: 95,
        screws: 4, concreteBags: 2
      },
      8: {
        postDesc: '2x2 x 10.5ft aluminum', postCost: 48,
        panelDesc: '8ft x 6ft aluminum panel', panelCost: 145,
        screws: 4, concreteBags: 2
      }
    },
    extras: { postCapCost: 5, concreteBagCost: 6, screwCost: 0.25, bracketCost: 4, bracketsPerPanel: 4 }
  },
  iron: {
    postSpacing: 8,
    heights: {
      4: {
        postDesc: '2x2 x 7ft steel', postCost: 35,
        panelDesc: '4ft x 8ft iron panel', panelCost: 110,
        screws: 8, concreteBags: 2
      },
      6: {
        postDesc: '2.5x2.5 x 9ft steel', postCost: 48,
        panelDesc: '6ft x 8ft iron panel', panelCost: 165,
        screws: 10, concreteBags: 3
      },
      8: {
        postDesc: '2.5x2.5 x 11ft steel', postCost: 62,
        panelDesc: '8ft x 8ft iron panel', panelCost: 240,
        screws: 12, concreteBags: 3
      }
    },
    extras: { postCapCost: 8, concreteBagCost: 6, bracketCost: 5, bracketsPerPanel: 4, screwCost: 0.30 }
  }
};

// === BOM Calculation ===
function calculateBOM(feet, fenceType, height) {
  const spec = BOM[fenceType];
  if (!spec || !spec.heights[height]) return null;

  const h = spec.heights[height];
  const ex = spec.extras;
  const sections = Math.max(0, Math.ceil(feet / spec.postSpacing));
  const posts = sections + 1;
  const items = [];
  let materialTotal = 0;

  // Helper to get price with custom override
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
    const linePosts = Math.max(0, posts - 2);
    const termPosts = Math.min(posts, 2 + (fenceClosed ? 0 : 0));
    const corners = fenceClosed ? fencePoints.length : Math.max(0, fencePoints.length - 2);
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

  // Filter out zero-qty items and calculate totals
  const filtered = items.filter(i => i.qty > 0).map(i => {
    i.total = Math.round(i.qty * i.unitCost * 100) / 100;
    materialTotal += i.total;
    return i;
  });

  return { items: filtered, materialTotal: Math.round(materialTotal) };
}

function renderBOM(bom) {
  const container = document.getElementById('bom-list');
  if (!bom || bom.items.length === 0) {
    container.innerHTML = '<p class="empty-state">Draw fence to see materials</p>';
    document.getElementById('bom-total').textContent = '$0';
    return;
  }

  container.innerHTML = bom.items.map(i =>
    `<div class="bom-row">
      <span class="bom-name">${i.qty} ${i.unit} — ${i.name}</span>
      <span class="bom-cost">$${i.total.toLocaleString()}</span>
    </div>`
  ).join('');

  document.getElementById('bom-total').textContent = '$' + bom.materialTotal.toLocaleString();
}

// === Custom Line Items ===
function addCustomItem() {
  customItems.push({ id: Date.now(), name: '', qty: 1, unitCost: 0 });
  renderCustomItems();
}

function removeCustomItem(id) {
  customItems = customItems.filter(i => i.id !== id);
  renderCustomItems();
  recalculate();
}

function updateCustomItem(id, field, value) {
  const item = customItems.find(i => i.id === id);
  if (item) {
    item[field] = field === 'name' ? value : parseFloat(value) || 0;
    recalculate();
  }
}

function renderCustomItems() {
  const container = document.getElementById('custom-items-list');
  if (customItems.length === 0) {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = customItems.map(i => `
    <div class="custom-item">
      <input type="text" placeholder="Item name" value="${i.name}" onchange="updateCustomItem(${i.id},'name',this.value)" class="ci-name">
      <input type="number" placeholder="Qty" value="${i.qty}" onchange="updateCustomItem(${i.id},'qty',this.value)" class="ci-qty">
      <span class="ci-dollar">$<input type="number" placeholder="0" value="${i.unitCost}" onchange="updateCustomItem(${i.id},'unitCost',this.value)" class="ci-cost"></span>
      <button class="gate-remove" onclick="removeCustomItem(${i.id})">&times;</button>
    </div>
  `).join('');
}

// === Pricing Editor ===
function showPricingEditor() {
  const type = selectedFence.type;
  const h = selectedHeight;
  const spec = BOM[type];
  if (!spec || !spec.heights[h]) return;

  const data = spec.heights[h];
  const ex = spec.extras;
  let rows = '';

  if (type === 'wood') {
    rows = pricingRow(type, h, 'postCost', 'Post', data.postCost)
      + pricingRow(type, h, 'railCost', 'Rail', data.railCost)
      + pricingRow(type, h, 'picketCost', 'Picket', data.picketCost)
      + pricingRowExtra(type, 'bracketCost', 'Bracket', ex.bracketCost)
      + pricingRowExtra(type, 'postCapCost', 'Post cap', ex.postCapCost)
      + pricingRowExtra(type, 'concreteBagCost', 'Concrete bag', ex.concreteBagCost)
      + pricingRowExtra(type, 'screwBoxCost', 'Screw box', ex.screwBoxCost);
  } else if (type === 'vinyl') {
    rows = pricingRow(type, h, 'postCost', 'Post', data.postCost)
      + pricingRow(type, h, 'panelCost', 'Panel', data.panelCost)
      + pricingRowExtra(type, 'stiffenerCost', 'Stiffener', ex.stiffenerCost)
      + pricingRowExtra(type, 'postCapCost', 'Post cap', ex.postCapCost)
      + pricingRowExtra(type, 'concreteBagCost', 'Concrete bag', ex.concreteBagCost);
  } else if (type === 'chain-link') {
    rows = pricingRow(type, h, 'linePostCost', 'Line post', data.linePostCost)
      + pricingRow(type, h, 'termPostCost', 'Terminal post', data.termPostCost)
      + pricingRow(type, h, 'topRailCost', 'Top rail', data.topRailCost)
      + pricingRow(type, h, 'fabricCost', 'Mesh roll', data.fabricCost)
      + pricingRowExtra(type, 'tensionBarCost', 'Tension bar', ex.tensionBarCost)
      + pricingRowExtra(type, 'tensionBandCost', 'Tension band', ex.tensionBandCost)
      + pricingRowExtra(type, 'concreteBagCost', 'Concrete bag', ex.concreteBagCost);
  } else if (type === 'aluminum' || type === 'iron') {
    rows = pricingRow(type, h, 'postCost', 'Post', data.postCost || 0)
      + pricingRow(type, h, 'panelCost', 'Panel', data.panelCost)
      + pricingRowExtra(type, 'bracketCost', 'Bracket', ex.bracketCost)
      + pricingRowExtra(type, 'postCapCost', 'Post cap', ex.postCapCost)
      + pricingRowExtra(type, 'concreteBagCost', 'Concrete bag', ex.concreteBagCost);
  }

  document.getElementById('pricing-editor-body').innerHTML = `
    <p class="pricing-header">${type.charAt(0).toUpperCase() + type.slice(1)} · ${h}ft</p>
    ${rows}
  `;
  document.getElementById('pricing-modal').style.display = 'flex';
}

function pricingRow(type, h, key, label, fallback) {
  const path = type + '.' + h + '.' + key;
  const val = customPricing[path] !== undefined ? customPricing[path] : fallback;
  return `<div class="pricing-row">
    <span>${label}</span>
    <div class="pricing-input-wrap">$<input type="number" step="0.25" value="${val}" onchange="setPricing('${path}',this.value,${fallback})"></div>
  </div>`;
}

function pricingRowExtra(type, key, label, fallback) {
  const path = type + '.extra.' + key;
  const val = customPricing[path] !== undefined ? customPricing[path] : fallback;
  return `<div class="pricing-row">
    <span>${label}</span>
    <div class="pricing-input-wrap">$<input type="number" step="0.25" value="${val}" onchange="setPricing('${path}',this.value,${fallback})"></div>
  </div>`;
}

function setPricing(path, value, fallback) {
  const num = parseFloat(value);
  if (num === fallback) {
    delete customPricing[path];
  } else {
    customPricing[path] = num;
  }
  saveCustomPricing();
  recalculate();
}

function closePricingEditor() {
  document.getElementById('pricing-modal').style.display = 'none';
}

// === Calculation ===
function recalculate() {
  const feet = updateFootage();
  const heightMult = selectedHeight === 4 ? 0.8 : selectedHeight === 8 ? 1.3 : 1.0;

  let fenceCost = feet * selectedFence.price * heightMult;
  const gateCost = gates.reduce((sum, g) => sum + g.price, 0);
  const removal = document.getElementById('addon-removal').checked ? feet * 3 : 0;
  const permit = document.getElementById('addon-permit').checked ? 150 : 0;
  const stain = document.getElementById('addon-stain').checked ? feet * 4 : 0;

  fenceCost *= terrainMultiplier;
  const customTotal = customItems.reduce((sum, i) => sum + (i.qty * i.unitCost), 0);
  const total = fenceCost + gateCost + removal + permit + stain + customTotal;

  // Update summary
  document.getElementById('sum-type').textContent = selectedFence.type.charAt(0).toUpperCase() + selectedFence.type.slice(1);
  document.getElementById('sum-height').textContent = selectedHeight;
  document.getElementById('sum-fence').textContent = '$' + Math.round(fenceCost).toLocaleString();

  document.getElementById('row-gates').style.display = gates.length > 0 ? 'flex' : 'none';
  document.getElementById('sum-gate-count').textContent = gates.length;
  document.getElementById('sum-gates').textContent = '$' + gateCost.toLocaleString();

  document.getElementById('row-removal').style.display = removal > 0 ? 'flex' : 'none';
  document.getElementById('sum-removal').textContent = '$' + Math.round(removal).toLocaleString();

  document.getElementById('row-permit').style.display = permit > 0 ? 'flex' : 'none';

  document.getElementById('row-stain').style.display = stain > 0 ? 'flex' : 'none';
  document.getElementById('sum-stain').textContent = '$' + Math.round(stain).toLocaleString();

  document.getElementById('row-terrain').style.display = terrainMultiplier > 1 ? 'flex' : 'none';
  document.getElementById('sum-terrain').textContent = '+' + Math.round((terrainMultiplier - 1) * 100) + '%';

  document.getElementById('row-custom').style.display = customTotal > 0 ? 'flex' : 'none';
  document.getElementById('sum-custom').textContent = '$' + Math.round(customTotal).toLocaleString();

  document.getElementById('sum-total').textContent = '$' + Math.round(total).toLocaleString();

  // BOM
  const bom = calculateBOM(feet, selectedFence.type, selectedHeight);
  renderBOM(bom);
}

// === Address Search ===
function searchAddress() {
  const query = document.getElementById('address-input').value.trim();
  if (!query) return;

  fetch('https://nominatim.openstreetmap.org/search?format=json&q=' + encodeURIComponent(query) + '&limit=1')
    .then(r => r.json())
    .then(data => {
      if (data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lon = parseFloat(data[0].lon);
        map.setView([lat, lon], 19);
        document.getElementById('cust-address').value = query;
      } else {
        showToast('Address not found. Try being more specific.');
      }
    })
    .catch(function() { showToast('Search failed. Check your connection.'); });
}

document.getElementById('address-input').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') searchAddress();
});

// === Share Link ===
function shareEstimate() {
  const data = {
    p: fencePoints.map(p => [Math.round(p.lat * 1e6) / 1e6, Math.round(p.lng * 1e6) / 1e6]),
    g: gates.map(g => ({ t: g.type, lt: Math.round(g.latlng.lat * 1e6) / 1e6, ln: Math.round(g.latlng.lng * 1e6) / 1e6 })),
    f: selectedFence.type,
    h: selectedHeight,
    t: terrainMultiplier,
    c: fenceClosed ? 1 : 0,
    cv: curveMode ? 1 : 0,
    a: [
      document.getElementById('addon-removal').checked ? 1 : 0,
      document.getElementById('addon-permit').checked ? 1 : 0,
      document.getElementById('addon-stain').checked ? 1 : 0
    ],
    n: document.getElementById('cust-name').value,
    ph: document.getElementById('cust-phone').value,
    ad: document.getElementById('cust-address').value,
    ci: customItems.filter(i => i.name && i.unitCost > 0).map(i => ({ nm: i.name, q: i.qty, uc: i.unitCost }))
  };

  const encoded = btoa(JSON.stringify(data));
  const url = window.location.origin + window.location.pathname + '?e=' + encoded;

  if (navigator.share) {
    navigator.share({ title: 'Fence Estimate', url: url }).catch(() => {
      copyToClipboard(url);
    });
  } else {
    copyToClipboard(url);
  }
}

function copyToClipboard(text) {
  // Try modern API first, fall back to textarea hack for HTTP
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('Link copied to clipboard');
    }).catch(() => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
    showToast('Link copied to clipboard');
  } catch (e) {
    prompt('Copy this link:', text);
  }
  document.body.removeChild(ta);
}

function loadFromURL() {
  const params = new URLSearchParams(window.location.search);
  const encoded = params.get('e');
  if (!encoded) return;

  try {
    const data = JSON.parse(atob(encoded));

    // Set customer info
    if (data.n) document.getElementById('cust-name').value = data.n;
    if (data.ph) document.getElementById('cust-phone').value = data.ph;
    if (data.ad) document.getElementById('cust-address').value = data.ad;

    // Set fence type
    const fenceTypes = { wood: 25, vinyl: 35, 'chain-link': 15, aluminum: 40, iron: 55 };
    if (data.f && fenceTypes[data.f]) {
      selectedFence = { type: data.f, price: fenceTypes[data.f] };
      document.querySelectorAll('.fence-type-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.fence-type-btn').forEach(b => {
        if (b.textContent.toLowerCase().includes(data.f.replace('-', ' '))) b.classList.add('active');
      });
    }

    // Set height
    if (data.h) {
      selectedHeight = data.h;
      document.querySelectorAll('.panel-section')[2].querySelectorAll('.height-btn').forEach(b => {
        b.classList.remove('active');
        if (b.textContent.trim() === data.h + ' ft') b.classList.add('active');
      });
    }

    // Set terrain
    if (data.t && data.t !== 1) {
      terrainMultiplier = data.t;
      const terrainLabels = { 1: 'Flat', 1.15: 'Slope', 1.3: 'Rocky' };
      document.querySelectorAll('.panel-section')[4].querySelectorAll('.height-btn').forEach(b => {
        b.classList.remove('active');
        if (b.textContent.trim() === terrainLabels[data.t]) b.classList.add('active');
      });
    }

    // Set addons
    if (data.a) {
      document.getElementById('addon-removal').checked = !!data.a[0];
      document.getElementById('addon-permit').checked = !!data.a[1];
      document.getElementById('addon-stain').checked = !!data.a[2];
    }

    // Draw fence points
    if (data.p && data.p.length > 0) {
      // Center map on first point
      map.setView(data.p[0], 19);

      data.p.forEach(pt => addFencePoint(L.latLng(pt[0], pt[1])));

      // Close if needed
      if (data.c) closeFence();
    }

    // Curve mode
    if (data.cv) {
      curveMode = true;
      const cb = document.getElementById('curve-btn');
      if (cb) cb.classList.add('active');
    }

    // Place gates
    if (data.g && data.g.length > 0) {
      data.g.forEach(g => {
        addGate(L.latLng(g.lt, g.ln));
        const gate = gates[gates.length - 1];
        if (g.t && g.t !== 'single') {
          gate.type = g.t;
          gate.price = g.t === 'double' ? 550 : g.t === 'sliding' ? 800 : 350;
        }
      });
      renderGates();
    }

    // Custom items
    if (data.ci && data.ci.length > 0) {
      data.ci.forEach(ci => {
        customItems.push({ id: Date.now() + Math.random(), name: ci.nm, qty: ci.q, unitCost: ci.uc });
      });
      renderCustomItems();
    }

    recalculate();

    // Clean URL
    window.history.replaceState({}, '', window.location.pathname);
  } catch (e) {
    // Bad data, ignore
  }
}

function showToast(msg) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('visible'));
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

// === Map Capture (draws fence diagram to canvas — no CORS issues) ===
function captureMap() {
  return new Promise(function(resolve) {
    try {
      var canvas = document.createElement('canvas');
      var w = 600;
      var h = 300;
      canvas.width = w;
      canvas.height = h;
      var ctx = canvas.getContext('2d');

      // Background
      ctx.fillStyle = '#e8e0d6';
      ctx.fillRect(0, 0, w, h);

      if (fencePoints.length < 2) {
        resolve(canvas.toDataURL('image/jpeg', 0.9));
        return;
      }

      // Calculate bounds of fence points
      var lats = fencePoints.map(function(p) { return p.lat; });
      var lngs = fencePoints.map(function(p) { return p.lng; });
      var minLat = Math.min.apply(null, lats);
      var maxLat = Math.max.apply(null, lats);
      var minLng = Math.min.apply(null, lngs);
      var maxLng = Math.max.apply(null, lngs);

      // Add padding
      var padLat = (maxLat - minLat) * 0.2 || 0.0002;
      var padLng = (maxLng - minLng) * 0.2 || 0.0002;
      minLat -= padLat; maxLat += padLat;
      minLng -= padLng; maxLng += padLng;

      function toX(lng) { return ((lng - minLng) / (maxLng - minLng)) * w; }
      function toY(lat) { return h - ((lat - minLat) / (maxLat - minLat)) * h; }

      // Draw grid lines
      ctx.strokeStyle = '#d4cdc4';
      ctx.lineWidth = 0.5;
      for (var gx = 0; gx < w; gx += 60) {
        ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke();
      }
      for (var gy = 0; gy < h; gy += 60) {
        ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke();
      }

      // Draw fence line
      var pts = fencePoints;
      if (curveMode && pts.length >= 3) {
        var spline = getSplinePoints(pts, fenceClosed);
        ctx.beginPath();
        ctx.moveTo(toX(spline[0].lng), toY(spline[0].lat));
        for (var i = 1; i < spline.length; i++) {
          ctx.lineTo(toX(spline[i].lng), toY(spline[i].lat));
        }
        if (fenceClosed) ctx.closePath();
        ctx.strokeStyle = '#c0622e';
        ctx.lineWidth = 3;
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(toX(pts[0].lng), toY(pts[0].lat));
        for (var i = 1; i < pts.length; i++) {
          ctx.lineTo(toX(pts[i].lng), toY(pts[i].lat));
        }
        if (fenceClosed) ctx.closePath();
        ctx.strokeStyle = '#c0622e';
        ctx.lineWidth = 3;
        if (!fenceClosed) ctx.setLineDash([8, 8]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Draw vertices
      pts.forEach(function(p) {
        var x = toX(p.lng);
        var y = toY(p.lat);
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#c0622e';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
      });

      // Draw segment labels
      var allPts = fenceClosed ? pts.concat([pts[0]]) : pts;
      for (var i = 1; i < allPts.length; i++) {
        var p1 = allPts[i - 1];
        var p2 = allPts[i];
        var mx = (toX(p1.lng) + toX(p2.lng)) / 2;
        var my = (toY(p1.lat) + toY(p2.lat)) / 2;
        var meters = p1.distanceTo(p2);
        var feet = Math.round(meters * 3.28084);

        var text = feet + ' ft';
        ctx.font = 'bold 11px sans-serif';
        var tw = ctx.measureText(text).width;

        ctx.fillStyle = 'rgba(44, 36, 23, 0.85)';
        ctx.fillRect(mx - tw / 2 - 5, my - 8, tw + 10, 16);
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, mx, my);
      }

      // Draw gate markers
      gates.forEach(function(g) {
        var x = toX(g.latlng.lng);
        var y = toY(g.latlng.lat);
        ctx.font = 'bold 10px sans-serif';
        var tw = ctx.measureText('GATE').width;
        ctx.fillStyle = '#c0622e';
        ctx.fillRect(x - tw / 2 - 5, y - 10, tw + 10, 18);
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('GATE', x, y - 1);
      });

      // Title
      ctx.font = 'bold 13px sans-serif';
      ctx.fillStyle = '#2c2417';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('Fence Layout — ' + updateFootage() + ' linear ft', 12, 10);

      resolve(canvas.toDataURL('image/jpeg', 0.9));
    } catch (e) {
      resolve(null);
    }
  });
}

// === PDF Generation ===
async function generatePDF() {
  try {
  showToast('Generating PDF...');

  // Capture map screenshot
  var mapImage = null;
  try {
    mapImage = await captureMap();
  } catch (e) {
    // Continue without map image
  }

  if (!window.jspdf) {
    showToast('PDF library not loaded. Try refreshing.');
    return;
  }
  var jsPDF = window.jspdf.jsPDF;
  var doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const w = doc.internal.pageSize.getWidth();
  const margin = 50;
  let y = 50;

  const custName = document.getElementById('cust-name').value || 'Customer';
  const custPhone = document.getElementById('cust-phone').value;
  const custAddr = document.getElementById('cust-address').value;
  const feet = parseInt(document.getElementById('total-feet').textContent.replace(/,/g, '')) || 0;
  const total = document.getElementById('sum-total').textContent;
  const fType = selectedFence.type.charAt(0).toUpperCase() + selectedFence.type.slice(1);
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const estNum = 'FC-' + Date.now().toString(36).toUpperCase().slice(-6);

  // Header
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(192, 98, 46);
  doc.text('FenceCalc', margin, y);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(140, 127, 110);
  doc.text('Satellite-powered fence estimates', margin, y + 16);

  doc.setFontSize(9);
  doc.setTextColor(140, 127, 110);
  doc.text('Estimate #' + estNum, w - margin, y, { align: 'right' });
  doc.text(today, w - margin, y + 14, { align: 'right' });

  y += 44;
  doc.setDrawColor(212, 205, 196);
  doc.line(margin, y, w - margin, y);
  y += 24;

  // Customer info
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(44, 36, 23);
  doc.text('Prepared for', margin, y);
  y += 16;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(custName, margin, y);
  if (custPhone) { y += 14; doc.text(custPhone, margin, y); }
  if (custAddr) { y += 14; doc.text(custAddr, margin, y); }

  y += 24;

  // Map image
  if (mapImage) {
    const imgW = w - margin * 2;
    const imgH = imgW * 0.5;
    doc.addImage(mapImage, 'JPEG', margin, y, imgW, imgH);
    // Border around map
    doc.setDrawColor(212, 205, 196);
    doc.setLineWidth(1);
    doc.rect(margin, y, imgW, imgH);
    y += imgH + 20;
  }

  // Project summary
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Project Summary', margin, y);
  y += 18;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(92, 80, 63);

  const summaryLines = [
    ['Fence Type', fType + (curveMode ? ' (curved)' : '')],
    ['Height', selectedHeight + ' ft'],
    ['Total Linear Footage', feet.toLocaleString() + ' ft'],
    ['Terrain', terrainMultiplier === 1 ? 'Flat' : terrainMultiplier === 1.15 ? 'Slope (+15%)' : 'Rocky (+30%)']
  ];
  if (gates.length > 0) {
    summaryLines.push(['Gates', gates.length + ' (' + gates.map(g => g.type).join(', ') + ')']);
  }

  summaryLines.forEach(([label, val]) => {
    doc.text(label, margin, y);
    doc.text(val, w - margin, y, { align: 'right' });
    y += 16;
  });

  y += 12;
  doc.line(margin, y, w - margin, y);
  y += 24;

  // BOM
  const bom = calculateBOM(feet, selectedFence.type, selectedHeight);
  if (bom && bom.items.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(44, 36, 23);
    doc.text('Material Breakdown', margin, y);
    y += 20;

    // Header row
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(140, 127, 110);
    doc.text('Item', margin, y);
    doc.text('Qty', w - margin - 120, y, { align: 'right' });
    doc.text('Unit Cost', w - margin - 50, y, { align: 'right' });
    doc.text('Total', w - margin, y, { align: 'right' });
    y += 6;
    doc.setDrawColor(230, 225, 218);
    doc.line(margin, y, w - margin, y);
    y += 14;

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(92, 80, 63);
    bom.items.forEach(item => {
      if (y > 700) {
        doc.addPage();
        y = 50;
      }
      doc.text(item.name, margin, y);
      doc.text(item.qty.toString(), w - margin - 120, y, { align: 'right' });
      doc.text('$' + item.unitCost.toFixed(2), w - margin - 50, y, { align: 'right' });
      doc.text('$' + item.total.toLocaleString(), w - margin, y, { align: 'right' });
      y += 15;
    });

    y += 4;
    doc.setDrawColor(212, 205, 196);
    doc.line(margin, y, w - margin, y);
    y += 16;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(192, 98, 46);
    doc.text('Materials Total', margin, y);
    doc.text('$' + bom.materialTotal.toLocaleString(), w - margin, y, { align: 'right' });
    y += 24;
  }

  // Custom items
  if (customItems.length > 0 && customItems.some(i => i.name && i.unitCost > 0)) {
    if (y > 660) { doc.addPage(); y = 50; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(44, 36, 23);
    doc.text('Additional Items', margin, y);
    y += 18;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(92, 80, 63);

    customItems.filter(i => i.name && i.unitCost > 0).forEach(i => {
      doc.text(i.name, margin, y);
      doc.text(i.qty + ' x $' + i.unitCost.toFixed(2), w - margin - 60, y, { align: 'right' });
      doc.text('$' + Math.round(i.qty * i.unitCost).toLocaleString(), w - margin, y, { align: 'right' });
      y += 15;
    });
    y += 10;
  }

  // Estimate summary
  if (y > 620) { doc.addPage(); y = 50; }
  y += 8;
  doc.setDrawColor(212, 205, 196);
  doc.line(margin, y, w - margin, y);
  y += 20;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(44, 36, 23);
  doc.text('Estimate Summary', margin, y);
  y += 20;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(92, 80, 63);

  const fenceCostText = document.getElementById('sum-fence').textContent;
  doc.text(fType + ' fence, ' + selectedHeight + 'ft', margin, y);
  doc.text(fenceCostText, w - margin, y, { align: 'right' });
  y += 16;

  if (gates.length > 0) {
    doc.text('Gates (' + gates.length + ')', margin, y);
    doc.text(document.getElementById('sum-gates').textContent, w - margin, y, { align: 'right' });
    y += 16;
  }

  if (document.getElementById('addon-removal').checked) {
    doc.text('Old fence removal', margin, y);
    doc.text(document.getElementById('sum-removal').textContent, w - margin, y, { align: 'right' });
    y += 16;
  }

  if (document.getElementById('addon-permit').checked) {
    doc.text('Permit fee', margin, y);
    doc.text('$150', w - margin, y, { align: 'right' });
    y += 16;
  }

  if (document.getElementById('addon-stain').checked) {
    doc.text('Stain / seal', margin, y);
    doc.text(document.getElementById('sum-stain').textContent, w - margin, y, { align: 'right' });
    y += 16;
  }

  if (terrainMultiplier > 1) {
    doc.text('Terrain adjustment', margin, y);
    doc.text(document.getElementById('sum-terrain').textContent, w - margin, y, { align: 'right' });
    y += 16;
  }

  const customTotal = customItems.reduce((sum, i) => sum + (i.qty * i.unitCost), 0);
  if (customTotal > 0) {
    doc.text('Custom items', margin, y);
    doc.text('$' + Math.round(customTotal).toLocaleString(), w - margin, y, { align: 'right' });
    y += 16;
  }

  // Total
  y += 4;
  doc.setDrawColor(192, 98, 46);
  doc.setLineWidth(2);
  doc.line(margin, y, w - margin, y);
  y += 20;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(61, 139, 55);
  doc.text('Total Estimate', margin, y);
  doc.text(total, w - margin, y, { align: 'right' });

  y += 40;

  // Footer
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(140, 127, 110);
  doc.text('This estimate is valid for 30 days. Actual costs may vary based on site conditions.', margin, y);
  doc.text('Generated by FenceCalc', margin, y + 12);

  // Save
  var filename = 'FenceCalc-' + custName.replace(/[^a-zA-Z0-9]/g, '-') + '-' + estNum + '.pdf';
  doc.save(filename);
  showToast('PDF downloaded');
  } catch (e) {
    showToast('PDF error: ' + e.message);
    console.error('PDF generation failed:', e);
  }
}

// === Reset ===
function resetEstimate() {
  clearAll();
  document.getElementById('cust-name').value = '';
  document.getElementById('cust-phone').value = '';
  document.getElementById('cust-address').value = '';
  document.getElementById('addon-removal').checked = false;
  document.getElementById('addon-permit').checked = false;
  document.getElementById('addon-stain').checked = false;

  document.querySelectorAll('.fence-type-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('.fence-type-btn').classList.add('active');
  selectedFence = { type: 'wood', price: 25 };

  document.querySelectorAll('.height-btn').forEach(b => b.classList.remove('active'));
  selectedHeight = 6;
  terrainMultiplier = 1.0;

  recalculate();
}

// === Panel Toggle (mobile) ===
function togglePanel() {
  const panel = document.getElementById('estimate-panel');
  panel.classList.toggle('collapsed');
  // Let the map resize after the panel animates
  setTimeout(() => map.invalidateSize(), 350);
}

// === Init ===
initMap();
recalculate();
loadFromURL();
