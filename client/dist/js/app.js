function escapeHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// === Polyline Encoding (Google's algorithm) ===
function encodePolyline(coords) {
  var s = '', pLat = 0, pLng = 0;
  for (var i = 0; i < coords.length; i++) {
    var lat = Math.round(coords[i][0] * 1e5), lng = Math.round(coords[i][1] * 1e5);
    s += encodeSignedInt(lat - pLat) + encodeSignedInt(lng - pLng);
    pLat = lat; pLng = lng;
  }
  return s;
}
function encodeSignedInt(v) {
  var n = v < 0 ? ~(v << 1) : (v << 1), s = '';
  while (n >= 0x20) { s += String.fromCharCode((0x20 | (n & 0x1f)) + 63); n >>= 5; }
  s += String.fromCharCode(n + 63);
  return s;
}
function decodePolyline(str) {
  var coords = [], i = 0, lat = 0, lng = 0;
  while (i < str.length) {
    var r = decodeNextInt(str, i); lat += r[0]; i = r[1];
    r = decodeNextInt(str, i); lng += r[0]; i = r[1];
    coords.push([lat / 1e5, lng / 1e5]);
  }
  return coords;
}
function decodeNextInt(str, idx) {
  var b, shift = 0, result = 0;
  do { b = str.charCodeAt(idx++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
  return [(result & 1) ? ~(result >> 1) : (result >> 1), idx];
}

// === State ===
let map;
let currentTool = 'draw';
let curveMode = false;
let fenceEnabled = true;
let mulchEnabled = true;

// Multi-section support
let sections = []; // array of { points, markers, line, labels, closed, curveMode }
let activeSectionIdx = 0;

// Shortcuts to active section (updated by switchSection)
let fencePoints = [];
let fenceLine = null;
let fenceMarkers = [];
let segmentLabels = [];
let fenceClosed = false;

let gates = [];
let gateMarkers = [];
let customItems = [];

// === Extras (add-on line items) ===
var defaultExtras = [
  { id: 'removal',   name: 'Old fence removal',     unit: 'ft',   price: 5,   on: false },
  { id: 'hauling',   name: 'Haul-away / disposal',  unit: 'flat', price: 150, on: false },
  { id: 'permit',    name: 'Permit',                 unit: 'flat', price: 150, on: false },
  { id: 'stain',     name: 'Stain / seal',           unit: 'ft',   price: 4,   on: false },
  { id: 'clearing',  name: 'Brush clearing',         unit: 'flat', price: 200, on: false },
  { id: 'grading',   name: 'Grading / leveling',     unit: 'flat', price: 500, on: false },
  { id: 'rock',      name: 'Rock / hard soil',       unit: 'flat', price: 300, on: false },
  { id: 'footing',   name: 'Footing removal',        unit: 'post', price: 75,  on: false }
];

function loadExtras() {
  var saved = JSON.parse(localStorage.getItem('fc_extras') || 'null');
  if (!saved) return defaultExtras.map(function(e) { return Object.assign({}, e); });
  // Merge saved with defaults so new defaults appear for existing users
  var map = {};
  saved.forEach(function(e) { map[e.id] = e; });
  var merged = defaultExtras.map(function(d) {
    if (map[d.id]) { var s = map[d.id]; return { id: d.id, name: s.name || d.name, unit: s.unit || d.unit, price: s.price != null ? s.price : d.price, on: false }; }
    return Object.assign({}, d);
  });
  // Append any user-added custom extras
  saved.forEach(function(e) {
    if (!defaultExtras.find(function(d) { return d.id === e.id; })) {
      merged.push({ id: e.id, name: e.name, unit: e.unit, price: e.price, on: false });
    }
  });
  return merged;
}
var extras = loadExtras();

function saveExtrasPricing() {
  localStorage.setItem('fc_extras', JSON.stringify(extras.map(function(e) { return { id: e.id, name: e.name, unit: e.unit, price: e.price }; })));
}

function getPostCount() {
  var feet = 0;
  sections.forEach(function(s) { if (s.points.length >= 2) { for (var i = 1; i < s.points.length; i++) feet += s.points[i-1].distanceTo(s.points[i]) * 3.28084; } });
  var spacing = 8;
  return Math.max(Math.ceil(feet / spacing) + 1, 0);
}

function calcExtraTotal(extra, feet) {
  if (!extra.on) return 0;
  if (extra.unit === 'ft') return feet * extra.price;
  if (extra.unit === 'post') return getPostCount() * extra.price;
  return extra.price; // flat
}

function calcAllExtras(feet) {
  return extras.reduce(function(sum, e) { return sum + calcExtraTotal(e, feet); }, 0);
}

function renderExtras() {
  var container = document.getElementById('extras-list');
  if (!container) return;
  var unitLabels = { ft: '/ft', post: '/post', flat: '' };
  container.innerHTML = extras.map(function(e, i) {
    var unitSuffix = unitLabels[e.unit] || '';
    return '<div class="addon-row">' +
      '<input type="checkbox" ' + (e.on ? 'checked' : '') + ' onchange="toggleExtra(' + i + ',this.checked)">' +
      '<span class="addon-name" onclick="editExtraName(' + i + ',this)">' + escapeHtml(e.name) + '</span>' +
      '<span class="addon-price-wrap">' +
        '<span class="addon-price-edit" onclick="editExtraPrice(' + i + ',this)">$' + e.price + unitSuffix + '</span>' +
      '</span>' +
      '<button class="extra-remove-btn" onclick="removeExtra(' + i + ')" title="Remove">&times;</button>' +
    '</div>';
  }).join('');
}

function toggleExtra(idx, on) {
  extras[idx].on = on;
  recalculate();
}

function editExtraPrice(idx, el) {
  var e = extras[idx];
  var unitLabels = { ft: '/ft', post: '/post', flat: '' };
  var unitOptions = '<option value="flat"' + (e.unit === 'flat' ? ' selected' : '') + '>Flat</option>' +
    '<option value="ft"' + (e.unit === 'ft' ? ' selected' : '') + '>/ft</option>' +
    '<option value="post"' + (e.unit === 'post' ? ' selected' : '') + '>/post</option>';
  var row = el.closest('.addon-row');
  var wrap = el.parentNode;
  wrap.innerHTML = '<span class="addon-price-editor">$<input type="number" value="' + e.price + '" class="extra-price-input" step="any" min="0">' +
    '<select class="extra-unit-select">' + unitOptions + '</select></span>';
  var input = wrap.querySelector('input');
  var select = wrap.querySelector('select');
  input.focus();
  input.select();
  function save() {
    e.price = parseFloat(input.value) || 0;
    e.unit = select.value;
    saveExtrasPricing();
    renderExtras();
    recalculate();
  }
  input.addEventListener('blur', function() { setTimeout(save, 150); });
  input.addEventListener('keydown', function(ev) { if (ev.key === 'Enter') save(); });
  select.addEventListener('change', save);
}

function addExtra() {
  var id = 'custom_' + Date.now();
  extras.push({ id: id, name: 'New item', unit: 'flat', price: 0, on: true });
  saveExtrasPricing();
  renderExtras();
  // Auto-edit name of the new one
  var rows = document.querySelectorAll('#extras-list .addon-row');
  var last = rows[rows.length - 1];
  if (last) {
    var nameEl = last.querySelector('.addon-name');
    editExtraName(extras.length - 1, nameEl);
  }
}

function editExtraName(idx, el) {
  var e = extras[idx];
  var input = document.createElement('input');
  input.type = 'text';
  input.value = e.name;
  input.className = 'extra-name-input';
  el.replaceWith(input);
  input.focus();
  input.select();
  function save() {
    e.name = input.value.trim() || 'Unnamed';
    saveExtrasPricing();
    renderExtras();
  }
  input.addEventListener('blur', save);
  input.addEventListener('keydown', function(ev) { if (ev.key === 'Enter') save(); });
}

function removeExtra(idx) {
  extras.splice(idx, 1);
  saveExtrasPricing();
  renderExtras();
  recalculate();
}

// Mulch areas
let mulchAreas = []; // array of { points, markers, polygon, labels, materialType, depth, deliveryMode }
let activeMulchPoints = []; // points being drawn for current mulch area (polygon mode)
let activeMulchMarkers = [];
let activeMulchPolygon = null;
let mulchDragStart = null; // for click-drag rectangle mode
let mulchDragRect = null; // L.rectangle during drag
let _mulchMarkerDragging = false; // suppress map click after dragging a mulch corner/polygon
let selectedMulchMaterial = 'hardwood';
let selectedMulchDepth = 3;
let selectedMulchDelivery = 'bags';

// Debounced recalculate for drag handlers — limits to once per animation frame
let _dragRecalcRAF = 0;
function recalculateDrag() {
  if (_dragRecalcRAF) return;
  _dragRecalcRAF = requestAnimationFrame(function() {
    _dragRecalcRAF = 0;
    recalculate();
  });
}

function initSections() {
  sections = [];
  addNewSection();
}

function addNewSection() {
  // Save current section state
  saveActiveSection();

  var newSection = {
    points: [],
    markers: [],
    line: null,
    labels: [],
    closed: false,
    curveMode: false,
    fenceType: selectedFence.type,
    fencePrice: selectedFence.price,
    fenceHeight: selectedHeight,
    notes: ''
  };
  sections.push(newSection);
  activeSectionIdx = sections.length - 1;
  loadActiveSection();
  updateSectionTabs();
  updateCloseButton();
  updateMidpointHandles();
  updateEmptyMapState();

  if (sections.length > 1) {
    showToast(t('toast_section_started', {n: sections.length}));
  }
}

function saveActiveSection() {
  if (sections.length === 0) return;
  var s = sections[activeSectionIdx];
  if (!s) return;
  s.points = fencePoints;
  s.markers = fenceMarkers;
  s.line = fenceLine;
  s.labels = segmentLabels;
  s.leaderLines = segLeaderLines;
  s.closed = fenceClosed;
  s.curveMode = curveMode;
  s.fenceType = selectedFence.type;
  s.fencePrice = selectedFence.price;
  s.fenceHeight = selectedHeight;
  var notesEl = document.getElementById('section-notes');
  if (notesEl) s.notes = notesEl.value;
}

function loadActiveSection() {
  var s = sections[activeSectionIdx];
  fencePoints = s.points;
  fenceMarkers = s.markers;
  fenceLine = s.line;
  segmentLabels = s.labels;
  segLeaderLines = s.leaderLines || [];
  fenceClosed = s.closed;
  curveMode = s.curveMode;

  // Restore section's fence type and height
  if (s.fenceType) {
    selectedFence = { type: s.fenceType, price: s.fencePrice || 25 };
    document.querySelectorAll('.fence-type-btn').forEach(function(b) { b.classList.remove('active'); });
    document.querySelectorAll('.fence-type-btn').forEach(function(b) {
      if (b.textContent.toLowerCase().indexOf(s.fenceType.replace('-', ' ')) >= 0) b.classList.add('active');
    });
  }
  if (s.fenceHeight) {
    selectedHeight = s.fenceHeight;
    // Update height buttons
    var heightBtns = document.querySelectorAll('.height-options')[0];
    if (heightBtns) {
      heightBtns.querySelectorAll('.height-btn').forEach(function(b) {
        b.classList.remove('active');
        if (b.textContent.trim() === s.fenceHeight + ' ft') b.classList.add('active');
      });
    }
    var customH = document.getElementById('custom-height');
    if (customH) customH.value = ([4, 6, 8].indexOf(s.fenceHeight) === -1) ? s.fenceHeight : '';
  }

  var btn = document.getElementById('curve-btn');
  if (btn) btn.classList.toggle('active', curveMode);

  // Restore notes
  var notesEl = document.getElementById('section-notes');
  if (notesEl) notesEl.value = s.notes || '';
}

function ensureSection(idx) {
  if (idx !== activeSectionIdx && idx >= 0 && idx < sections.length) {
    switchSection(idx);
  }
}

function switchSection(idx) {
  if (idx === activeSectionIdx) return;
  if (idx < 0 || idx >= sections.length) return;
  saveActiveSection();
  activeSectionIdx = idx;
  loadActiveSection();
  updateSectionTabs();
  updateCloseButton();
  updateMidpointHandles();
  recalculate();
}

function deleteSection(idx) {
  if (sections.length <= 1) {
    // Just clear the only section
    clearAll();
    return;
  }

  // Remove map elements for this section
  var s = sections[idx];
  s.markers.forEach(function(m) { map.removeLayer(m); });
  s.labels.forEach(function(l) { map.removeLayer(l); });
  (s.leaderLines || []).forEach(function(l) { map.removeLayer(l); });
  if (s.line) map.removeLayer(s.line);

  sections.splice(idx, 1);

  if (activeSectionIdx >= sections.length) {
    activeSectionIdx = sections.length - 1;
  } else if (activeSectionIdx > idx) {
    activeSectionIdx--;
  } else if (activeSectionIdx === idx) {
    activeSectionIdx = Math.min(idx, sections.length - 1);
  }

  loadActiveSection();
  updateSectionTabs();
  updateCloseButton();
  updateMidpointHandles();
  recalculate();
  showToast(t('toast_section_removed'));
}

function updateSectionTabs() {
  var container = document.getElementById('section-tabs');
  if (!container) return;

  if (sections.length <= 1) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'flex';
  container.innerHTML = sections.map(function(s, i) {
    var feet = 0;
    for (var j = 1; j < s.points.length; j++) {
      feet += s.points[j - 1].distanceTo(s.points[j]);
    }
    if (s.closed && s.points.length > 2) {
      feet += s.points[s.points.length - 1].distanceTo(s.points[0]);
    }
    feet = Math.round(feet * 3.28084);
    var isActive = i === activeSectionIdx;
    var typeLabel = (s.fenceType || 'wood').charAt(0).toUpperCase();
    return '<button class="section-tab' + (isActive ? ' active' : '') + '" onclick="switchSection(' + i + ')">' +
      typeLabel + (i + 1) + (feet > 0 ? ' ' + feet + 'ft' : '') +
    '</button>';
  }).join('') +
  '<button class="section-tab section-tab-add" onclick="addNewSection()" title="Add section">+</button>';
}

// Get total footage across ALL sections
function getTotalFootageAllSections() {
  var totalMeters = 0;
  sections.forEach(function(s, idx) {
    var pts = s.points;
    var isCurve = s.curveMode;
    var isClosed = s.closed;

    if (isCurve && pts.length >= 3) {
      var spline = getSplinePoints(pts, isClosed);
      for (var i = 1; i < spline.length; i++) {
        totalMeters += spline[i - 1].distanceTo(spline[i]);
      }
    } else {
      for (var i = 1; i < pts.length; i++) {
        totalMeters += pts[i - 1].distanceTo(pts[i]);
      }
      if (isClosed && pts.length > 2) {
        totalMeters += pts[pts.length - 1].distanceTo(pts[0]);
      }
    }
  });
  return Math.round(totalMeters * 3.28084);
}
var baseFencePrices = { wood: 25, vinyl: 35, 'chain-link': 15, aluminum: 40, iron: 55 };
let selectedFence = { type: 'wood', price: 25 };

function updateFencePricesForRegion() {
  var mult = (typeof REGIONS !== 'undefined' && typeof companyRegion !== 'undefined' && REGIONS[companyRegion])
    ? REGIONS[companyRegion].multiplier : 1;

  // Load any custom per-foot prices from pricebook
  var pb = (typeof companyPricebook !== 'undefined') ? companyPricebook : {};
  Object.keys(pb).forEach(function(k) {
    if (k.startsWith('perFoot.')) {
      var type = k.replace('perFoot.', '');
      baseFencePrices[type] = pb[k];
    }
  });

  document.querySelectorAll('.fence-type-btn').forEach(function(btn) {
    var type = btn.dataset.type;
    if (!type) return;
    var base = baseFencePrices[type] || 25;
    // Only apply regional multiplier if there's no custom per-foot price
    var hasCustom = pb['perFoot.' + type] !== undefined;
    var adjusted = hasCustom ? base : Math.round(base * mult);
    btn.dataset.price = adjusted;
    var priceEl = btn.querySelector('.fence-price');
    if (priceEl) priceEl.textContent = '$' + adjusted + '/ft';
  });
  // Update selectedFence price too
  var hasCustomSelected = pb['perFoot.' + selectedFence.type] !== undefined;
  var adjPrice = hasCustomSelected ? baseFencePrices[selectedFence.type] : Math.round((baseFencePrices[selectedFence.type] || 25) * mult);
  selectedFence.price = adjPrice;

  // Rebuild mulch prices with regional multiplier
  MULCH = buildRegionalMulch();
}
let selectedHeight = 6;
let terrainMultiplier = 1.0;

// === Custom Pricing (overrides BOM defaults) ===
let customPricing = JSON.parse(localStorage.getItem('fc_pricing') || '{}');

function saveCustomPricing() {
  localStorage.setItem('fc_pricing', JSON.stringify(customPricing));
}

// === Unit System (metric toggle) ===
let useMetric = localStorage.getItem('fc_metric') === 'true';

function toggleMetric() {
  useMetric = !useMetric;
  localStorage.setItem('fc_metric', useMetric);
  var btn = document.getElementById('unit-toggle');
  if (btn) btn.textContent = useMetric ? 'm' : 'ft';
  if (map) {
    document.querySelectorAll('.leaflet-control-scale-line').forEach(function(el) { el.remove(); });
    L.control.scale({ imperial: !useMetric, metric: useMetric, position: 'bottomleft', maxWidth: 150 }).addTo(map);
  }
  refreshLabels();
  recalculate();
}

function fmtLen(feet) {
  if (useMetric) return Math.round(feet * 0.3048) + ' m';
  return feet + ' ft';
}
function fmtLenVal(feet) { return useMetric ? Math.round(feet * 0.3048) : feet; }
function fmtLenUnit() { return useMetric ? 'm' : 'ft'; }
function fmtArea(sqft) {
  if (useMetric) return (sqft * 0.092903).toFixed(0) + ' m²';
  return sqft.toLocaleString() + ' sq ft';
}

function refreshLabels() {
  // Redraw fence segment labels
  redrawSegmentLabels();
  // Redraw mulch area labels
  if (mulchAreas.length > 0) renderMulchAreas();
  // Update footage display
  updateFootage();
}
function fmtHeight(ft) {
  if (useMetric) return Math.round(ft * 0.3048 * 10) / 10 + ' m';
  return ft + ' ft';
}
function fmtCuYd(cuyd) {
  if (useMetric) return (cuyd * 0.764555).toFixed(1) + ' m³';
  return cuyd + ' cu yd';
}

function getPrice(fenceType, height, key, fallback) {
  const path = fenceType + '.' + height + '.' + key;
  if (customPricing[path] !== undefined) return customPricing[path];
  return fallback;
}

// === Map Init ===
let baseLayers = {};

function initMap() {
  // Check if opening a shared link — start at those coordinates instead of default
  var initCenter = [37.6068, -77.3732];
  var initZoom = 18;
  try {
    var ep = new URLSearchParams(window.location.search).get('e');
    if (ep) {
      var sd = JSON.parse(atob(ep));
      // Resolve coordinates: v2 uses polyline strings, v1 uses arrays
      var fPts = sd._v >= 2 && typeof sd.p === 'string' ? decodePolyline(sd.p) : sd.p;
      var maPts = sd.ma && sd.ma.length > 0 ? (sd._v >= 2 && sd.ma[0].pl ? decodePolyline(sd.ma[0].pl) : sd.ma[0].pts) : null;
      if (sd.vw && sd.vz) {
        initCenter = sd.vw;
        initZoom = sd.vz;
      } else if (sd.vz && fPts && fPts.length > 0) {
        initCenter = fPts[0];
        initZoom = sd.vz;
      } else if (maPts && maPts.length > 0) {
        initCenter = maPts[0];
        initZoom = sd.vz || 19;
      } else if (fPts && fPts.length > 0) {
        initCenter = fPts[0];
        initZoom = sd.vz || 19;
      }
    }
  } catch (e) {}

  var usingDefault = initCenter[0] === 37.6068 && initCenter[1] === -77.3732;

  map = L.map('map', {
    center: initCenter,
    zoom: initZoom,
    zoomControl: false
  });

  // If no shared link or saved data, try to center on user's location
  if (usingDefault && navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(function(pos) {
      map.setView([pos.coords.latitude, pos.coords.longitude], 18, { animate: true });
    }, function() {}, { timeout: 5000, maximumAge: 300000 });
  }

  // Scale bar — shows real-world distance on the map
  L.control.scale({
    imperial: !useMetric,
    metric: useMetric,
    position: 'bottomleft',
    maxWidth: 150
  }).addTo(map);

  // Zoom indicator with accuracy info
  var zoomIndicator = L.control({ position: 'bottomright' });
  zoomIndicator.onAdd = function() {
    var div = L.DomUtil.create('div', 'zoom-indicator');
    div.id = 'zoom-indicator';
    updateZoomIndicator(div, map.getZoom());
    return div;
  };
  zoomIndicator.addTo(map);

  map.on('zoomend', function() {
    var div = document.getElementById('zoom-indicator');
    if (div) updateZoomIndicator(div, map.getZoom());
  });

  function updateZoomIndicator(div, zoom) {
    // Approximate feet per pixel at equator, adjusted for typical US latitudes (~38°)
    var metersPerPixel = 156543.03 * Math.cos(38 * Math.PI / 180) / Math.pow(2, zoom);
    var feetPerPixel = metersPerPixel * 3.28084;
    var accuracy;
    var color;
    if (zoom >= 20) { accuracy = t('accuracy_excellent'); color = '#2d6e28'; }
    else if (zoom >= 18) { accuracy = t('accuracy_good'); color = '#2d6e28'; }
    else if (zoom >= 16) { accuracy = t('accuracy_fair'); color = '#d4870e'; }
    else { accuracy = t('accuracy_low'); color = '#b93a2a'; }

    var pxLabel = useMetric ? (metersPerPixel.toFixed(1) + ' m/px') : (feetPerPixel.toFixed(1) + ' ft/px');
    div.innerHTML = '<span style="color:' + color + '">' + accuracy + '</span> ~' + pxLabel;
    div.title = 'Zoom ' + zoom + ' — each pixel ≈ ' + pxLabel + '. Zoom in for more precise placement.';
  }

  // Detect TWA / standalone mode and add padding for "Not Secure" bar
  if (window.matchMedia('(display-mode: standalone)').matches ||
      document.referrer.includes('android-app://') ||
      navigator.standalone === true) {
    document.body.classList.add('twa-mode');
  }

  // Handle viewport resize (browser chrome, "Not Secure" bar, keyboard, etc.)
  function handleResize() {
    document.body.style.height = (window.visualViewport ? window.visualViewport.height : window.innerHeight) + 'px';
    map.invalidateSize();
  }
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', handleResize);
  }
  window.addEventListener('resize', function() { setTimeout(handleResize, 100); });

  // Google satellite — best coverage at high zoom in most US metro areas
  var googleSat = L.tileLayer('https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
    maxZoom: 22,
    maxNativeZoom: 21,
    subdomains: '0123',
    attribution: 'Imagery &copy; <a href="https://www.google.com/intl/en_us/help/terms_maps/" target="_blank">Google</a>'
  });

  // ESRI satellite — fallback / alternative
  var esriSat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 22,
    maxNativeZoom: 19,
    attribution: 'Tiles &copy; Esri'
  });

  baseLayers.satellite = googleSat;

  baseLayers.streets = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 22,
    maxNativeZoom: 19,
    attribution: '&copy; OpenStreetMap'
  });

  baseLayers.topo = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 22,
    maxNativeZoom: 19,
    attribution: 'Tiles &copy; Esri'
  });

  baseLayers.hybrid = L.layerGroup([
    L.tileLayer('https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', { maxZoom: 22, maxNativeZoom: 21, subdomains: '0123' }),
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 22, maxNativeZoom: 19, opacity: 0.5 })
  ]);

  baseLayers.esri = esriSat;

  baseLayers.satellite.addTo(map);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  map.on('click', onMapClick);
  initMulchDragHandlers();
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

// === Drone Photo Overlay ===
var droneOverlay = null;
var droneOverlayData = null;

function toggleDronePhoto() {
  // If overlay exists, remove it
  if (droneOverlay) {
    removeDroneOverlay();
    return;
  }
  // Otherwise, open file picker
  document.getElementById('drone-input').click();
}

function closeDroneBanner() {
  document.getElementById('drone-banner').style.display = 'none';
}

function handleDroneUpload(input) {
  if (!input.files || !input.files[0]) return;
  var file = input.files[0];
  if (file.size > 50 * 1024 * 1024) {
    showToast(t('toast_image_too_large'));
    input.value = '';
    return;
  }

  var reader = new FileReader();
  reader.onload = function(e) {
    var img = new Image();
    img.onload = function() {
      // Place overlay centered on current map view, sized to fit
      var center = map.getCenter();
      var bounds = map.getBounds();
      var aspect = img.width / img.height;

      // Make the overlay cover roughly 60% of the current view
      var latSpan = (bounds.getNorth() - bounds.getSouth()) * 0.6;
      var lngSpan = latSpan * aspect;

      var overlayBounds = L.latLngBounds(
        [center.lat - latSpan / 2, center.lng - lngSpan / 2],
        [center.lat + latSpan / 2, center.lng + lngSpan / 2]
      );

      // Remove old overlay
      if (droneOverlay) map.removeLayer(droneOverlay);

      droneOverlay = L.imageOverlay(e.target.result, overlayBounds, {
        opacity: 0.7,
        interactive: false
      }).addTo(map);

      // Make it draggable and resizable via corner handles
      makeDroneAdjustable(overlayBounds);

      droneOverlayData = {
        dataUrl: e.target.result,
        bounds: [[overlayBounds.getSouth(), overlayBounds.getWest()],
                 [overlayBounds.getNorth(), overlayBounds.getEast()]]
      };

      document.getElementById('drone-banner').style.display = '';
      document.getElementById('drone-btn').classList.add('active');
      markUnsaved();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
  input.value = '';
}

var droneCorners = [];

function makeDroneAdjustable(bounds) {
  droneCorners.forEach(function(m) { map.removeLayer(m); });
  droneCorners = [];

  var isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  var handleSize = isMobile ? 20 : 14;

  var corners = [
    bounds.getSouthWest(),
    bounds.getNorthWest(),
    bounds.getNorthEast(),
    bounds.getSouthEast()
  ];

  corners.forEach(function(latlng, idx) {
    var marker = L.circleMarker(latlng, {
      radius: handleSize / 2,
      color: '#c0622e',
      fillColor: '#c0622e',
      fillOpacity: 1,
      weight: 2,
      interactive: true,
      bubblingMouseEvents: false
    }).addTo(map);

    if (marker.getElement) {
      var el = marker.getElement();
      if (el) el.style.cursor = 'nwse-resize';
    }

    // Use bindDrag for touch+mouse support
    if (typeof bindDrag === 'function') {
      bindDrag(marker,
        function() {},
        function(ll) {
          marker.setLatLng(ll);
          updateDroneFromCorners();
        },
        function() { markUnsaved(); }
      );
    } else {
      marker.on('mousedown', function(e) {
        map.dragging.disable();
        var onMove = function(ev) { marker.setLatLng(ev.latlng); updateDroneFromCorners(); };
        var onUp = function() { map.off('mousemove', onMove); map.off('mouseup', onUp); map.dragging.enable(); markUnsaved(); };
        map.on('mousemove', onMove);
        map.on('mouseup', onUp);
        L.DomEvent.stopPropagation(e);
      });
    }

    droneCorners.push(marker);
  });

  // Make the overlay draggable only when NOT in draw/gate/mulch mode
  // Clicks pass through to the map for drawing tools
  droneOverlay.options.interactive = true;
  droneOverlay.options.bubblingMouseEvents = true; // let clicks bubble to map

  if (typeof bindDrag === 'function') {
    bindDrag(droneOverlay,
      function(ll) {
        // Only allow drag if not in a drawing tool
        if (currentTool === 'draw' || currentTool === 'gate' || currentTool === 'mulch') return null;
        return {
          startLat: ll.lat, startLng: ll.lng,
          origCorners: droneCorners.map(function(m) { var l = m.getLatLng(); return { lat: l.lat, lng: l.lng }; })
        };
      },
      function(ll, ctx) {
        if (!ctx) return;
        var dLat = ll.lat - ctx.startLat;
        var dLng = ll.lng - ctx.startLng;
        ctx.origCorners.forEach(function(c, i) {
          droneCorners[i].setLatLng([c.lat + dLat, c.lng + dLng]);
        });
        updateDroneFromCorners();
      },
      function() { markUnsaved(); }
    );
  }
}

function updateDroneFromCorners() {
  if (droneCorners.length < 4 || !droneOverlay) return;
  var lats = droneCorners.map(function(m) { return m.getLatLng().lat; });
  var lngs = droneCorners.map(function(m) { return m.getLatLng().lng; });
  var newBounds = L.latLngBounds(
    [Math.min.apply(null, lats), Math.min.apply(null, lngs)],
    [Math.max.apply(null, lats), Math.max.apply(null, lngs)]
  );
  droneOverlay.setBounds(newBounds);
  if (droneOverlayData) {
    droneOverlayData.bounds = [[newBounds.getSouth(), newBounds.getWest()],
                                [newBounds.getNorth(), newBounds.getEast()]];
  }
}

function setDroneOpacity(val) {
  if (droneOverlay) droneOverlay.setOpacity(val / 100);
}

function removeDroneOverlay() {
  if (droneOverlay) { map.removeLayer(droneOverlay); droneOverlay = null; }
  droneCorners.forEach(function(m) { map.removeLayer(m); });
  droneCorners = [];
  droneOverlayData = null;
  document.getElementById('drone-banner').style.display = 'none';
  document.getElementById('drone-btn').classList.remove('active');
  markUnsaved();
  showToast(t('toast_drone_removed'));
}

function onMapClick(e) {
  // Delete mode: deselect on empty space click but stay in mode
  if (_deleteMode) {
    if (_selectedMulchIdx >= 0 || _selectedFenceSectionIdx >= 0 || _selectedGateIdx >= 0) {
      deselectAll();
      showDeleteModeBar();
    }
    return;
  }
  // Drawing is always free — save/share/PDF are gated

  // Warn if zoomed too far out for accurate placement
  if (map.getZoom() < 16 && (currentTool === 'draw' || currentTool === 'gate')) {
    showToast(t('toast_zoom_closer'));
    return;
  }
  if (map.getZoom() < 18 && currentTool === 'draw' && fencePoints.length === 0) {
    showToast(t('toast_zoom_tip'));
  }
  if (currentTool === 'draw' && !fenceClosed) {
    addFencePoint(e.latlng);
  } else if (currentTool === 'gate') {
    addGate(e.latlng);
  } else if (currentTool === 'mulch') {
    // Tap to place mulch corners (works on mobile + desktop)
    addMulchPoint(e.latlng);
  }
}

// === Segment Labels ===
var segLabelOffsets = {}; // key: sectionIdx-segIndex → {dlat, dlng}
var segLeaderLines = [];
var _isMobileDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

function createSegmentLabel(p1, p2, segIndex) {
  var meters = p1.distanceTo(p2);
  var feet = Math.round(meters * 3.28084);
  var midLat = (p1.lat + p2.lat) / 2;
  var midLng = (p1.lng + p2.lng) / 2;
  var anchorLat = midLat;
  var anchorLng = midLng;
  var secIdx = activeSectionIdx;

  // Offset perpendicular to segment so label doesn't cover the line
  var dLat = p2.lat - p1.lat;
  var dLng = p2.lng - p1.lng;
  var len = Math.sqrt(dLat * dLat + dLng * dLng);
  var perpLat = 0, perpLng = 0;
  if (len > 0) {
    perpLat = -dLng / len;
    perpLng = dLat / len;
    midLat += perpLat * 0.00003;
    midLng += perpLng * 0.00003;
  }

  // Apply any saved offset (drag or tap-toggle)
  var offKey = secIdx + '-' + segIndex;
  var isOffset = !!segLabelOffsets[offKey];
  if (isOffset) {
    midLat += segLabelOffsets[offKey].dlat;
    midLng += segLabelOffsets[offKey].dlng;
  }

  var label = L.marker([midLat, midLng], {
    icon: L.divIcon({
      className: 'segment-label',
      html: '<div class="seg-label seg-clickable" data-seg="' + segIndex + '">' +
        '<span onclick="ensureSection(' + secIdx + '); editSegmentLength(' + segIndex + ', event)">' + fmtLen(feet) + '</span>' +
        '<button class="seg-delete" onclick="event.stopPropagation(); ensureSection(' + secIdx + '); deleteSegment(' + segIndex + ')" title="Remove segment">&times;</button>' +
      '</div>',
      iconSize: [60, 16],
      iconAnchor: [30, 8]
    }),
    interactive: true,
    draggable: !_isMobileDevice
  }).addTo(map);

  // Leader line (only visible when label has been moved away)
  var leaderLine = L.polyline([[anchorLat, anchorLng], [midLat, midLng]], {
    color: '#c0622e', weight: 1, opacity: isOffset ? 0.6 : 0, dashArray: '4,4',
    interactive: false
  }).addTo(map);
  segLeaderLines.push(leaderLine);

  label._anchorLat = anchorLat;
  label._anchorLng = anchorLng;
  label._perpLat = perpLat;
  label._perpLng = perpLng;
  label._offKey = offKey;
  label._leaderLine = leaderLine;
  label._isOffset = isOffset;
  label._p1 = p1;
  label._p2 = p2;
  label._dLat = dLat;
  label._dLng = dLng;
  label._segLen = len;

  if (!_isMobileDevice) {
    // Desktop: drag to reposition
    label.on('dragstart', function() { label._dragStartLL = label.getLatLng(); });
    label.on('drag', function() {
      var ll = label.getLatLng();
      leaderLine.setLatLngs([[label._anchorLat, label._anchorLng], [ll.lat, ll.lng]]);
      leaderLine.setStyle({ opacity: 0.6 });
    });
    label.on('dragend', function() {
      var ll = label.getLatLng();
      var baseLat = (label._p1.lat + label._p2.lat) / 2;
      var baseLng = (label._p1.lng + label._p2.lng) / 2;
      if (label._segLen > 0) {
        baseLat += label._perpLat * 0.00003;
        baseLng += label._perpLng * 0.00003;
      }
      segLabelOffsets[label._offKey] = { dlat: ll.lat - baseLat, dlng: ll.lng - baseLng };
      label._isOffset = true;
    });
  }

  return label;
}

function toggleSegLabelPosition(label) {
  var snapDist = 0.00015; // ~15 meters outward
  if (label._isOffset) {
    // Snap back to default position
    delete segLabelOffsets[label._offKey];
    label._isOffset = false;
    var baseLat = (label._p1.lat + label._p2.lat) / 2 + label._perpLat * 0.00003;
    var baseLng = (label._p1.lng + label._p2.lng) / 2 + label._perpLng * 0.00003;
    label.setLatLng([baseLat, baseLng]);
    label._leaderLine.setStyle({ opacity: 0 });
  } else {
    // Snap outward perpendicular to segment
    var offLat = label._perpLat * snapDist;
    var offLng = label._perpLng * snapDist;
    segLabelOffsets[label._offKey] = { dlat: offLat, dlng: offLng };
    label._isOffset = true;
    var baseLat = (label._p1.lat + label._p2.lat) / 2 + label._perpLat * 0.00003;
    var baseLng = (label._p1.lng + label._p2.lng) / 2 + label._perpLng * 0.00003;
    label.setLatLng([baseLat + offLat, baseLng + offLng]);
    label._leaderLine.setLatLngs([[label._anchorLat, label._anchorLng], [baseLat + offLat, baseLng + offLng]]);
    label._leaderLine.setStyle({ opacity: 0.6 });
  }
}

function deleteFencePoint(ptIdx) {
  if (ptIdx < 0 || ptIdx >= fencePoints.length) return;

  // Save for undo
  var deletedPoint = fencePoints[ptIdx];
  undoStack.push({ type: 'deletePoint', sectionIdx: activeSectionIdx, pointIdx: ptIdx, latlng: { lat: deletedPoint.lat, lng: deletedPoint.lng } });
  redoStack = [];

  if (fencePoints.length <= 2) {
    // Would leave 0 or 1 points — clear the section
    fencePoints = [];
    fenceMarkers.forEach(function(m) { map.removeLayer(m); });
    fenceMarkers = [];
  } else {
    fencePoints.splice(ptIdx, 1);
    var marker = fenceMarkers.splice(ptIdx, 1)[0];
    if (marker) map.removeLayer(marker);
  }

  rebuildAllMarkers();
  redrawFenceLine();
  redrawSegmentLabels();
  updateCloseButton();
  updateMidpointHandles();
  recalculate();
  markUnsaved();
  updateEmptyMapState();
}

function deleteSegment(segIndex) {
  // Remove the second point of this segment
  // For the closing segment (last index), remove the last point instead
  var removeIdx;
  if (segIndex >= fencePoints.length - 1 && fenceClosed) {
    // Closing segment — open the fence instead
    openFence();
    return;
  } else {
    removeIdx = segIndex + 1;
  }

  if (removeIdx < 0 || removeIdx >= fencePoints.length) return;

  // Save deleted point for undo
  var deletedPoint = fencePoints[removeIdx];
  undoStack.push({ type: 'deletePoint', sectionIdx: activeSectionIdx, pointIdx: removeIdx, latlng: { lat: deletedPoint.lat, lng: deletedPoint.lng } });

  if (fencePoints.length <= 2) {
    // Would leave 0 or 1 points — just clear
    fencePoints = [];
    fenceMarkers.forEach(function(m) { map.removeLayer(m); });
    fenceMarkers = [];
  } else {
    fencePoints.splice(removeIdx, 1);
    var marker = fenceMarkers.splice(removeIdx, 1)[0];
    if (marker) map.removeLayer(marker);
  }

  rebuildAllMarkers();
  redrawFenceLine();
  redrawSegmentLabels();
  updateCloseButton();
  updateMidpointHandles();
  recalculate();
  markUnsaved();
  updateEmptyMapState();
}

function editSegmentLength(segIndex, event) {
  if (event) event.stopPropagation();

  // Figure out which two points this segment connects
  var p1idx, p2idx;
  var totalSegs = fenceClosed ? fencePoints.length : fencePoints.length - 1;
  if (segIndex < fencePoints.length - 1) {
    p1idx = segIndex;
    p2idx = segIndex + 1;
  } else if (fenceClosed && segIndex === fencePoints.length - 1) {
    // Closing segment
    p1idx = fencePoints.length - 1;
    p2idx = 0;
  } else {
    return;
  }

  var p1 = fencePoints[p1idx];
  var p2 = fencePoints[p2idx];
  var currentFeet = Math.round(p1.distanceTo(p2) * 3.28084);

  // Replace the label with an input
  var el = document.querySelector('.seg-label[data-seg="' + segIndex + '"]');
  if (!el) return;

  el.innerHTML = '<input type="number" class="seg-input" value="' + currentFeet + '" ' +
    'onblur="applySegmentLength(' + segIndex + ', this.value)" ' +
    'onkeydown="if(event.key===\'Enter\'){applySegmentLength(' + segIndex + ', this.value);}" ' +
    'onclick="event.stopPropagation()" ' +
    'style="width:50px;text-align:center;border:none;background:transparent;color:#fff;font-weight:600;font-size:12px;outline:none;font-family:inherit">';
  el.classList.add('seg-editing');

  var input = el.querySelector('input');
  input.focus();
  input.select();
}

function applySegmentLength(segIndex, value) {
  var newFeet = parseFloat(value);
  if (!newFeet || newFeet <= 0) {
    redrawSegmentLabels();
    return;
  }

  var p1idx, p2idx;
  if (segIndex < fencePoints.length - 1) {
    p1idx = segIndex;
    p2idx = segIndex + 1;
  } else if (fenceClosed && segIndex === fencePoints.length - 1) {
    p1idx = fencePoints.length - 1;
    p2idx = 0;
  } else {
    redrawSegmentLabels();
    return;
  }

  var p1 = fencePoints[p1idx];
  var p2 = fencePoints[p2idx];

  // Calculate bearing from p1 to p2
  var dLng = (p2.lng - p1.lng) * Math.PI / 180;
  var lat1 = p1.lat * Math.PI / 180;
  var lat2 = p2.lat * Math.PI / 180;
  var y = Math.sin(dLng) * Math.cos(lat2);
  var x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  var bearing = Math.atan2(y, x);

  // Calculate new position for p2 at the desired distance along the same bearing
  var newMeters = newFeet / 3.28084;
  var R = 6371000;
  var lat1r = p1.lat * Math.PI / 180;
  var lng1r = p1.lng * Math.PI / 180;
  var newLat = Math.asin(Math.sin(lat1r) * Math.cos(newMeters / R) + Math.cos(lat1r) * Math.sin(newMeters / R) * Math.cos(bearing));
  var newLng = lng1r + Math.atan2(Math.sin(bearing) * Math.sin(newMeters / R) * Math.cos(lat1r), Math.cos(newMeters / R) - Math.sin(lat1r) * Math.sin(newLat));

  newLat = newLat * 180 / Math.PI;
  newLng = newLng * 180 / Math.PI;

  // Move the point
  fencePoints[p2idx] = L.latLng(newLat, newLng);

  // Update the marker position
  if (fenceMarkers[p2idx]) {
    fenceMarkers[p2idx].setLatLng(fencePoints[p2idx]);
  }

  rebuildAllMarkers();
  redrawFenceLine();
  redrawSegmentLabels();
  updateMidpointHandles();
  recalculate();

  showToast(t('toast_segment_set', {n: newFeet}));
}

var angleLabels = [];

function redrawSegmentLabels() {
  segmentLabels.forEach(l => map.removeLayer(l));
  segmentLabels = [];
  segLeaderLines.forEach(l => map.removeLayer(l));
  segLeaderLines = [];
  angleLabels.forEach(l => map.removeLayer(l));
  angleLabels = [];

  for (var i = 1; i < fencePoints.length; i++) {
    segmentLabels.push(createSegmentLabel(fencePoints[i - 1], fencePoints[i], i - 1));
  }
  // Closing segment label
  if (fenceClosed && fencePoints.length > 2) {
    segmentLabels.push(createSegmentLabel(fencePoints[fencePoints.length - 1], fencePoints[0], fencePoints.length - 1));
  }

  // Corner angle labels
  if (fencePoints.length >= 3) {
    for (var i = 1; i < fencePoints.length - (fenceClosed ? 0 : 1); i++) {
      var prev = fencePoints[(i - 1 + fencePoints.length) % fencePoints.length];
      var curr = fencePoints[i % fencePoints.length];
      var next = fencePoints[(i + 1) % fencePoints.length];
      if (fenceClosed || (i > 0 && i < fencePoints.length - 1)) {
        var angle = getCornerAngle(prev, curr, next);
        angleLabels.push(createAngleLabel(curr, angle));
      }
    }
    // First point angle if closed
    if (fenceClosed) {
      var angle = getCornerAngle(fencePoints[fencePoints.length - 1], fencePoints[0], fencePoints[1]);
      angleLabels.push(createAngleLabel(fencePoints[0], angle));
    }
  }
}

function getCornerAngle(p1, p2, p3) {
  // Use proper geodetic bearing accounting for latitude compression
  function bearing(from, to) {
    var lat1 = from.lat * Math.PI / 180;
    var lat2 = to.lat * Math.PI / 180;
    var dLng = (to.lng - from.lng) * Math.PI / 180;
    var y = Math.sin(dLng) * Math.cos(lat2);
    var x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    return Math.atan2(y, x) * 180 / Math.PI;
  }

  var b1 = bearing(p2, p1);
  var b2 = bearing(p2, p3);

  var angle = Math.abs(b2 - b1);
  if (angle > 180) angle = 360 - angle;

  return Math.round(angle);
}

function createAngleLabel(point, angle) {
  var label = L.marker(point, {
    icon: L.divIcon({
      className: 'angle-label',
      html: '<div class="angle-tag">' + angle + '&deg;</div>',
      iconSize: [36, 18],
      iconAnchor: [18, 30]
    }),
    interactive: false
  }).addTo(map);
  return label;
}

// === Fence Drawing ===
function addFencePoint(latlng) {
  fencePoints.push(latlng);

  const idx = fencePoints.length - 1;
  const sectionAtCreation = activeSectionIdx;
  const marker = L.marker(latlng, {
    draggable: true,
    icon: L.divIcon({
      className: 'fence-vertex',
      iconSize: [22, 22],
      iconAnchor: [11, 11]
    })
  }).addTo(map);

  var wasDragged = false;
  marker.on('dragstart', function() {
    wasDragged = true;
    if (activeSectionIdx !== sectionAtCreation && sectionAtCreation < sections.length) {
      switchSection(sectionAtCreation);
    }
  });
  marker.on('drag', function(e) {
    fencePoints[idx] = e.target.getLatLng();
    redrawFenceLine();
    redrawSegmentLabels();
    recalculateDrag();
  });
  marker.on('dragend', function() {
    redrawSegmentLabels();
    recalculate();
    setTimeout(function() { wasDragged = false; }, 100);
  });

  // Tap/click to show delete option — delay binding so placement click doesn't trigger
  setTimeout(function() {
    marker.on('click', function(e) {
      if (wasDragged) return;
      if (currentTool === 'draw' && !fenceClosed) return; // don't show popup while actively drawing
      if (activeSectionIdx !== sectionAtCreation && sectionAtCreation < sections.length) {
        switchSection(sectionAtCreation);
      }
      var ptIdx = fenceMarkers.indexOf(marker);
      if (ptIdx < 0) return;
      L.popup({ closeButton: true, className: 'fence-delete-popup', offset: [0, -15] })
        .setLatLng(marker.getLatLng())
        .setContent('<div style="text-align:center;padding:4px"><b style="font-size:12px">Point ' + (ptIdx + 1) + '</b><br><button onclick="deleteFencePoint(' + ptIdx + ');map.closePopup()" style="margin-top:6px;padding:6px 16px;background:#b93a2a;color:#fff;border:none;border-radius:6px;font-weight:600;cursor:pointer;font-size:12px">Delete Point</button></div>')
        .openOn(map);
    });
  }, 500);

  fenceMarkers.push(marker);

  // Auto-close: if clicking near the first point with 3+ points, close the fence
  if (fencePoints.length > 3) {
    var firstPx = map.latLngToContainerPoint(fencePoints[0]);
    var clickedPx = map.latLngToContainerPoint(latlng);
    if (firstPx.distanceTo(clickedPx) < 20) {
      // Remove the last point (the close-click) and close
      fencePoints.pop();
      map.removeLayer(fenceMarkers.pop());
      closeFence();
      return;
    }
  }

  // Push to undo stack, clear redo (new action after undo)
  undoStack.push({ type: 'point', sectionIdx: activeSectionIdx });
  redoStack = [];

  redrawFenceLine();
  redrawSegmentLabels();
  updateCloseButton();
  updateMidpointHandles();
  recalculate();
  markUnsaved();
  updateEmptyMapState();
  hintAfterFirstPoint();
  hintAfterThreePoints();
  hintAfter50Feet();

  // Check for nearby section endpoints to offer merge
  checkSectionJoin(latlng);
}

// === Section Join Detection ===
var SNAP_DISTANCE_METERS = 8; // ~26 feet — generous snap radius for easy joining

function checkSectionJoin(newPoint) {
  if (sections.length < 2) return;
  if (fencePoints.length < 1) return;

  saveActiveSection();

  for (var i = 0; i < sections.length; i++) {
    if (i === activeSectionIdx) continue;
    var other = sections[i];
    if (other.points.length < 1) continue;
    if (other.closed) continue;

    var otherStart = other.points[0];
    var otherEnd = other.points[other.points.length - 1];

    // Ensure they're Leaflet LatLng objects for distanceTo
    if (!otherStart.distanceTo) otherStart = L.latLng(otherStart.lat, otherStart.lng);
    if (!otherEnd.distanceTo) otherEnd = L.latLng(otherEnd.lat, otherEnd.lng);

    var distToStart = newPoint.distanceTo(otherStart);
    var distToEnd = newPoint.distanceTo(otherEnd);

    if (distToStart < SNAP_DISTANCE_METERS || distToEnd < SNAP_DISTANCE_METERS) {
      showMergePrompt(i, distToStart < distToEnd ? 'start' : 'end');
      return;
    }
  }
}

var mergeTarget = null;

function showMergePrompt(otherIdx, whichEnd) {
  var active = sections[activeSectionIdx];
  var other = sections[otherIdx];

  // Check if materials match
  var activeType = active.fenceType || selectedFence.type;
  var otherType = other.fenceType || 'wood';
  var activeHeight = active.fenceHeight || selectedHeight;
  var otherHeight = other.fenceHeight || 6;

  if (activeType !== otherType || activeHeight !== otherHeight) {
    // Different materials — don't offer merge
    showToast(t('toast_sections_diff_material', {a: activeType, b: otherType}));
    return;
  }

  mergeTarget = { otherIdx: otherIdx, whichEnd: whichEnd };

  var existing = document.getElementById('merge-toast');
  if (existing) existing.remove();

  var toast = document.createElement('div');
  toast.id = 'merge-toast';
  toast.className = 'undo-toast';
  toast.innerHTML = '<span>' + t('toast_sections_overlap') + '</span><button onclick="mergeSections()">' + t('toast_merge_join') + '</button><button onclick="dismissMerge()" style="color:var(--text-muted)">' + t('toast_merge_ignore') + '</button>';
  document.body.appendChild(toast);
  requestAnimationFrame(function() { toast.classList.add('visible'); });

  setTimeout(function() { dismissMerge(); }, 10000);
}

// Close Gap — scan all sections for nearby endpoints and offer to connect them
function findGaps() {
  saveActiveSection();
  if (sections.length < 2) { showToast('Need at least 2 fence sections to find gaps'); return; }

  var gaps = [];
  var maxGapMeters = 30; // ~100 feet max gap to detect

  for (var i = 0; i < sections.length; i++) {
    var si = sections[i];
    if (si.points.length < 2 || si.closed) continue;

    for (var j = i + 1; j < sections.length; j++) {
      var sj = sections[j];
      if (sj.points.length < 2 || sj.closed) continue;

      // Check all 4 endpoint pairs
      var endpoints = [
        { a: si.points[si.points.length - 1], b: sj.points[0], ai: i, ae: 'end', bi: j, be: 'start' },
        { a: si.points[si.points.length - 1], b: sj.points[sj.points.length - 1], ai: i, ae: 'end', bi: j, be: 'end' },
        { a: si.points[0], b: sj.points[0], ai: i, ae: 'start', bi: j, be: 'start' },
        { a: si.points[0], b: sj.points[sj.points.length - 1], ai: i, ae: 'start', bi: j, be: 'end' }
      ];

      endpoints.forEach(function(ep) {
        var pa = L.latLng(ep.a.lat, ep.a.lng);
        var pb = L.latLng(ep.b.lat, ep.b.lng);
        var dist = pa.distanceTo(pb);
        if (dist > 0.5 && dist < maxGapMeters) {
          gaps.push({
            dist: dist,
            feet: Math.round(dist * 3.28084),
            midLat: (ep.a.lat + ep.b.lat) / 2,
            midLng: (ep.a.lng + ep.b.lng) / 2,
            a: ep.a, b: ep.b,
            ai: ep.ai, ae: ep.ae, bi: ep.bi, be: ep.be
          });
        }
      });
    }
  }

  if (gaps.length === 0) {
    showToast('No gaps found between sections');
    return;
  }

  // Sort by distance, show the closest gap
  gaps.sort(function(a, b) { return a.dist - b.dist; });
  var gap = gaps[0];

  // Draw a dashed line showing the gap
  if (window._gapLine) map.removeLayer(window._gapLine);
  window._gapLine = L.polyline([[gap.a.lat, gap.a.lng], [gap.b.lat, gap.b.lng]], {
    color: '#ff3333', weight: 3, dashArray: '6,6', opacity: 0.8
  }).addTo(map);

  // Show popup at the midpoint
  L.popup({ closeButton: true, className: 'gap-popup' })
    .setLatLng([gap.midLat, gap.midLng])
    .setContent(
      '<div style="text-align:center;padding:4px">' +
        '<b style="font-size:13px">' + gap.feet + ' ft gap</b><br>' +
        '<span style="font-size:11px;color:#666">Between Section ' + (gap.ai + 1) + ' and Section ' + (gap.bi + 1) + '</span><br>' +
        '<button onclick="closeGap(' + JSON.stringify(gap).replace(/"/g, '&quot;') + ')" ' +
          'style="margin-top:8px;padding:8px 16px;background:#ff6b1a;color:#fff;border:none;border-radius:6px;font-weight:600;cursor:pointer;font-size:12px">Close Gap</button>' +
      '</div>'
    )
    .on('remove', function() {
      if (window._gapLine) { map.removeLayer(window._gapLine); window._gapLine = null; }
    })
    .openOn(map);

  // Center on the gap
  map.setView([gap.midLat, gap.midLng], Math.max(map.getZoom(), 19), { animate: true });
}

function closeGap(gap) {
  map.closePopup();
  if (window._gapLine) { map.removeLayer(window._gapLine); window._gapLine = null; }

  saveActiveSection();

  // Extend section A's endpoint to meet section B's endpoint
  var secA = sections[gap.ai];
  var targetPoint = L.latLng(gap.b.lat, gap.b.lng);

  // Switch to section A
  switchSection(gap.ai);

  // Add the connecting point
  if (gap.ae === 'end') {
    addFencePoint(targetPoint);
  } else {
    // Prepend — insert at beginning
    fencePoints.unshift(targetPoint);
    var marker = L.marker(targetPoint, {
      draggable: true,
      icon: L.divIcon({ className: 'fence-vertex', iconSize: [22, 22], iconAnchor: [11, 11] })
    }).addTo(map);
    fenceMarkers.unshift(marker);
    rebindMarkerDrags();
    redrawFenceLine();
    redrawSegmentLabels();
  }

  recalculate();
  markUnsaved();
  showToast('Gap closed — ' + gap.feet + ' ft connected');

  // Check for more gaps
  setTimeout(function() {
    saveActiveSection();
    // Quick check if more gaps exist
    var moreGaps = false;
    for (var i = 0; i < sections.length && !moreGaps; i++) {
      for (var j = i + 1; j < sections.length && !moreGaps; j++) {
        if (sections[i].points.length < 2 || sections[j].points.length < 2) continue;
        var ends = [sections[i].points[sections[i].points.length - 1], sections[j].points[0]];
        var d = L.latLng(ends[0].lat, ends[0].lng).distanceTo(L.latLng(ends[1].lat, ends[1].lng));
        if (d > 0.5 && d < 30) moreGaps = true;
      }
    }
    if (moreGaps) showToast('More gaps detected — tap Close Gap again');
  }, 500);
}

function dismissMerge() {
  mergeTarget = null;
  var toast = document.getElementById('merge-toast');
  if (toast) {
    toast.classList.remove('visible');
    setTimeout(function() { toast.remove(); }, 300);
  }
}

function mergeSections() {
  if (!mergeTarget) return;

  var activeIdx = activeSectionIdx;
  var otherIdx = mergeTarget.otherIdx;
  var whichEnd = mergeTarget.whichEnd;

  saveActiveSection();

  var active = sections[activeIdx];
  var other = sections[otherIdx];

  // Determine merge order
  var mergedPoints;
  if (whichEnd === 'start') {
    // Active section's last point is near other's start
    // Remove the overlapping point from active, concat: active + other
    var activePoints = active.points.slice(0, -1); // remove last (snap) point
    mergedPoints = activePoints.concat(other.points);
  } else {
    // Active section's last point is near other's end
    // Concat: other + active (without first overlapping point)
    var activePoints = active.points.slice(0, -1);
    mergedPoints = other.points.concat(activePoints);
  }

  // Remove both sections' map elements
  [active, other].forEach(function(s) {
    s.markers.forEach(function(m) { map.removeLayer(m); });
    s.labels.forEach(function(l) { map.removeLayer(l); });
    if (s.line) map.removeLayer(s.line);
  });

  // Remove both sections (higher index first to avoid shifting)
  var toRemove = [activeIdx, otherIdx].sort(function(a, b) { return b - a; });
  toRemove.forEach(function(idx) { sections.splice(idx, 1); });

  // Create merged section — preserve material from active section
  var merged = {
    points: [],
    markers: [],
    line: null,
    labels: [],
    closed: false,
    curveMode: active.curveMode,
    fenceType: active.fenceType || selectedFence.type,
    fencePrice: active.fencePrice || selectedFence.price,
    fenceHeight: active.fenceHeight || selectedHeight
  };
  sections.push(merged);
  activeSectionIdx = sections.length - 1;

  // Load it and re-add all points (rebuilds markers, lines, labels)
  fencePoints = [];
  fenceMarkers = [];
  segmentLabels = [];
  fenceLine = null;
  fenceClosed = false;

  loadActiveSection();

  mergedPoints.forEach(function(pt) {
    addFencePoint(pt);
  });

  updateSectionTabs();
  recalculate();

  dismissMerge();
  showToast(t('toast_sections_joined'));
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
    // White outline for contrast on any background
    if (window._fenceLineOutline) map.removeLayer(window._fenceLineOutline);
    window._fenceLineOutline = L.polyline(pts, {
      color: '#fff', weight: 8, opacity: 0.5,
      dashArray: fenceClosed ? null : '10, 8', interactive: false
    }).addTo(map);

    fenceLine = L.polyline(pts, {
      color: '#ff6b1a', weight: 4, opacity: 1,
      dashArray: fenceClosed ? null : '10, 8',
      interactive: true
    }).addTo(map);
    var _secIdx = activeSectionIdx;
    fenceLine.on('click', function(e) {
      L.DomEvent.stopPropagation(e);
      selectFenceSection(_secIdx);
    });
  } else {
    if (window._fenceLineOutline) { map.removeLayer(window._fenceLineOutline); window._fenceLineOutline = null; }
  }
}

function toggleCurve() {
  curveMode = !curveMode;
  const btn = document.getElementById('curve-btn');
  if (btn) btn.classList.toggle('active', curveMode);
  redrawFenceLine();
  updateMidpointHandles();
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
      recalculateDrag();
    });

    marker.on('dragend', function() {
      redrawSegmentLabels();
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
  redrawSegmentLabels();

  updateCloseButton();
  updateMidpointHandles();
  recalculate();
}

function openFence() {
  fenceClosed = false;
  redrawFenceLine();
  redrawSegmentLabels();
  updateCloseButton();
  updateMidpointHandles();
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
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg> ' + t('tool_open');
    btn.onclick = openFence;
  } else {
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg> ' + t('tool_close');
    btn.onclick = closeFence;
  }
}

function updateFootage() {
  // Save current section before aggregating
  saveActiveSection();
  var totalFeet = getTotalFootageAllSections();
  document.getElementById('total-feet').textContent = fmtLenVal(totalFeet).toLocaleString();
  var unitLabel = document.getElementById('total-feet-unit');
  if (unitLabel) unitLabel.textContent = fmtLenUnit();
  updateSectionTabs();
  return totalFeet;
}

// === Gates ===
function addGate(latlng) {
  var gateId = Date.now();
  var gate = { id: gateId, latlng: latlng, type: 'single', price: 350 };
  gates.push(gate);

  var marker = L.marker(latlng, {
    draggable: true,
    icon: L.divIcon({
      className: 'gate-marker',
      html: '<div style="background:#c0622e;color:#fff;font-weight:700;font-size:10px;padding:2px 8px;border-radius:3px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.3);letter-spacing:0.5px;">' + t('gate_marker_label') + '</div>',
      iconSize: [50, 20],
      iconAnchor: [25, 28]
    })
  }).addTo(map);

  // Make gate draggable — update position on drag
  marker.on('dragend', function(e) {
    var g = gates.find(function(x) { return x.id === gateId; });
    if (g) {
      g.latlng = e.target.getLatLng();
      markUnsaved();
    }
  });

  marker.on('click', function(e) {
    if (_deleteMode) {
      L.DomEvent.stopPropagation(e);
      var gIdx = gates.findIndex(function(x) { return x.id === gateId; });
      if (gIdx >= 0) selectGate(gIdx);
    }
  });

  gateMarkers.push({ id: gateId, marker: marker });

  // Push to undo stack
  undoStack.push({ type: 'gate', id: gateId });
  redoStack = [];

  renderGates();
  recalculate();
  setTool('draw');
  markUnsaved();
  hintAfterGate();
}

function renderGates() {
  const list = document.getElementById('gates-list');
  if (gates.length === 0) {
    list.innerHTML = '<p class="empty-state">' + t('gates_empty') + '</p>';
    return;
  }
  list.innerHTML = gates.map((g, i) => `
    <div class="gate-item">
      <span>${t('gate_label')} ${i + 1}</span>
      <select onchange="updateGateType(${g.id}, this.value)">
        <option value="single" ${g.type === 'single' ? 'selected' : ''}>${t('gate_single')} ($350)</option>
        <option value="double" ${g.type === 'double' ? 'selected' : ''}>${t('gate_double')} ($550)</option>
        <option value="sliding" ${g.type === 'sliding' ? 'selected' : ''}>${t('gate_sliding')} ($1,200)</option>
      </select>
      <button class="gate-remove" onclick="removeGate(${g.id})">&#x2715;</button>
    </div>
  `).join('');
}

function updateGateType(id, type) {
  const gate = gates.find(g => g.id === id);
  if (gate) {
    gate.type = type;
    gate.price = type === 'single' ? 350 : type === 'double' ? 550 : 1200;
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
  // Clean up mulch drawing state when switching away
  if (currentTool === 'mulch' && tool !== 'mulch') {
    hideMulchDoneBtn();
    if (activeMulchPoints.length > 0) {
      activeMulchMarkers.forEach(function(m) { map.removeLayer(m); });
      activeMulchPoints = [];
      activeMulchMarkers = [];
      if (activeMulchPolygon) { map.removeLayer(activeMulchPolygon); activeMulchPolygon = null; }
    }
  }

  currentTool = tool;
  document.querySelectorAll('.tool-btn:not(#close-btn)').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById(tool + '-btn');
  if (btn) btn.classList.add('active');

  map.getContainer().style.cursor = tool === 'draw' ? 'crosshair' : tool === 'gate' ? 'cell' : tool === 'mulch' ? 'crosshair' : '';

  if (tool === 'mulch') {
    var isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (isMobile) {
      showToast('Tap corners to outline the mulch bed');
    } else {
      showToast('Click corners or drag to draw a mulch bed');
    }
  }
  updateEmptyMapState();
}

// === Undo Stack ===
var undoStack = [];
var redoStack = [];

function redoLast() {
  if (redoStack.length === 0) return;
  var item = redoStack.pop();

  if (item.type === 'point') {
    addFencePoint(L.latLng(item.latlng.lat, item.latlng.lng));
  } else if (item.type === 'gate') {
    addGate(L.latLng(item.latlng.lat, item.latlng.lng));
  } else if (item.type === 'mulchArea') {
    finalizeMulchArea(item.points);
    // finalizeMulchArea pushes to undoStack via the mulch action
  } else if (item.type === 'closeFence') {
    closeFence();
  }
}

function undoLast() {
  // If actively drawing mulch polygon points, undo those first (not on the stack)
  if (currentTool === 'mulch' && activeMulchPoints.length > 0) {
    activeMulchPoints.pop();
    var mp = activeMulchMarkers.pop();
    if (mp) map.removeLayer(mp);
    redrawActiveMulchPolygon();
    if (activeMulchPoints.length < 3) hideMulchDoneBtn();
    markUnsaved();
    return;
  }

  // If fence is closed, open it and push close action to redo
  if (fenceClosed) {
    redoStack.push({ type: 'closeFence' });
    openFence();
    return;
  }

  if (undoStack.length === 0) return;

  var last = undoStack.pop();

  if (last.type === 'gate') {
    var gateId = last.id;
    var gate = gates.find(function(g) { return g.id === gateId; });
    var gm = gateMarkers.find(function(g) { return g.id === gateId; });
    if (gate) redoStack.push({ type: 'gate', latlng: { lat: gate.latlng.lat, lng: gate.latlng.lng } });
    if (gm) {
      map.removeLayer(gm.marker);
      gateMarkers = gateMarkers.filter(function(g) { return g.id !== gateId; });
    }
    gates = gates.filter(function(g) { return g.id !== gateId; });
    renderGates();
    recalculate();
    markUnsaved();
    showToast(t('toast_gate_removed'));

  } else if (last.type === 'mulchArea') {
    var area = mulchAreas[last.mulchIdx !== undefined ? last.mulchIdx : mulchAreas.length - 1];
    if (area) {
      redoStack.push({ type: 'mulchArea', points: area.points.slice() });
      removeMulchArea(last.mulchIdx !== undefined ? last.mulchIdx : mulchAreas.length - 1);
    }

  } else if (last.type === 'point') {
    if (last.sectionIdx !== activeSectionIdx) {
      switchSection(last.sectionIdx);
    }

    if (fencePoints.length > 0) {
      var removedPt = fencePoints[fencePoints.length - 1];
      redoStack.push({ type: 'point', latlng: { lat: removedPt.lat, lng: removedPt.lng }, sectionIdx: last.sectionIdx });
      fencePoints.pop();
      var marker = fenceMarkers.pop();
      if (marker) map.removeLayer(marker);

      rebindMarkerDrags();
      redrawFenceLine();
      redrawSegmentLabels();
      updateCloseButton();
      updateMidpointHandles();
      recalculate();
      markUnsaved();
      updateEmptyMapState();
    }

  } else if (last.type === 'deletePoint') {
    // Undo deleted fence point — re-insert it
    if (last.sectionIdx !== activeSectionIdx) {
      switchSection(last.sectionIdx);
    }
    var latlng = L.latLng(last.latlng.lat, last.latlng.lng);
    fencePoints.splice(last.pointIdx, 0, latlng);
    var newMarker = L.marker(latlng, {
      draggable: true,
      icon: L.divIcon({ className: 'fence-vertex', iconSize: [22, 22], iconAnchor: [11, 11] })
    }).addTo(map);
    fenceMarkers.splice(last.pointIdx, 0, newMarker);
    rebindMarkerDrags();
    redrawFenceLine();
    redrawSegmentLabels();
    updateCloseButton();
    updateMidpointHandles();
    recalculate();
    markUnsaved();
    showToast('Point restored');

  } else if (last.type === 'deleteMulch') {
    // Undo deleted mulch area — recreate it
    finalizeMulchArea(last.points);
    showToast('Mulch area restored');
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
      recalculateDrag();
    });
    marker.on('dragend', function() {
      redrawSegmentLabels();
      recalculate();
    });
  });
}

function clearAll() {
  if (fencePoints.length > 0 || mulchAreas.length > 0 || gates.length > 0) {
    if (!confirm('Clear everything? This cannot be undone.')) return;
  }
  // Clear ALL sections from map
  sections.forEach(function(s) {
    s.markers.forEach(function(m) { map.removeLayer(m); });
    s.labels.forEach(function(l) { map.removeLayer(l); });
    if (s.line) map.removeLayer(s.line);
  });
  sections = [];

  fencePoints = [];
  fenceMarkers = [];
  segmentLabels = [];
  fenceLine = null;
  fenceClosed = false;

  gates = [];
  gateMarkers.forEach(function(g) { map.removeLayer(g.marker); });
  gateMarkers = [];
  renderGates();

  midpointMarkers.forEach(function(m) { map.removeLayer(m); });
  midpointMarkers = [];

  angleLabels.forEach(function(l) { map.removeLayer(l); });
  angleLabels = [];

  // Clear mulch areas
  mulchAreas.forEach(function(a) {
    a.markers.forEach(function(m) { map.removeLayer(m); });
    if (a.polygon) map.removeLayer(a.polygon);
    if (a.areaLabel) map.removeLayer(a.areaLabel);
    if (a.rotMarker) map.removeLayer(a.rotMarker);
    if (a.rotLine) map.removeLayer(a.rotLine);
  });
  mulchAreas = [];
  activeMulchPoints = [];
  activeMulchMarkers.forEach(function(m) { map.removeLayer(m); });
  activeMulchMarkers = [];
  if (activeMulchPolygon) { map.removeLayer(activeMulchPolygon); activeMulchPolygon = null; }
  renderMulchAreas();

  // Clear undo stack
  undoStack = [];

  // Start fresh with one section
  addNewSection();

  updateCloseButton();
  updateMidpointHandles();
  recalculate();
  updateEmptyMapState();
}

// === Fence Selection ===
function selectFence(btn, type) {
  document.querySelectorAll('.fence-type-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  selectedFence = { type, price: parseInt(btn.dataset.price) };
  recalculate();
  markUnsaved();
  hintFenceType();
}

function editFencePrice(e, type) {
  e.stopPropagation();
  var priceEl = e.target;
  var btn = priceEl.closest('.fence-type-btn');
  var current = parseInt(btn.dataset.price);

  var input = document.createElement('input');
  input.type = 'number';
  input.min = '1';
  input.step = '1';
  input.value = current;
  input.style.cssText = 'width:48px;padding:2px 4px;font-size:0.75rem;font-weight:700;text-align:center;border:1.5px solid var(--accent);border-radius:3px;background:var(--bg);color:var(--text);outline:none;';

  priceEl.textContent = '';
  priceEl.appendChild(document.createTextNode('$'));
  priceEl.appendChild(input);
  priceEl.appendChild(document.createTextNode('/ft'));
  input.focus();
  input.select();

  function save() {
    var val = parseInt(input.value) || current;
    btn.dataset.price = val;
    priceEl.textContent = '$' + val + '/ft';
    baseFencePrices[type] = val;

    // Save to pricebook
    if (typeof companyPricebook !== 'undefined') {
      companyPricebook['perFoot.' + type] = val;
      localStorage.setItem('fc_pricebook', JSON.stringify(companyPricebook));
      if (typeof Auth !== 'undefined' && Auth.isLoggedIn()) {
        API.updateCompany({ pricebook: companyPricebook }).catch(function() {});
      }
    }

    // Update selected fence if this is the active type
    if (selectedFence.type === type) {
      selectedFence.price = val;
    }
    recalculate();
    markUnsaved();
  }

  input.addEventListener('blur', save);
  input.addEventListener('keydown', function(ev) {
    if (ev.key === 'Enter') { input.blur(); }
    if (ev.key === 'Escape') { input.value = current; input.blur(); }
  });
}

function selectHeight(btn, height) {
  btn.parentElement.querySelectorAll('.height-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  if (height) selectedHeight = height;
  // Clear custom input when a preset is selected
  var customInput = document.getElementById('custom-height');
  if (customInput) customInput.value = '';
  recalculate();
}

function setCustomHeight(value) {
  var h = parseFloat(value);
  if (!h || h < 1 || h > 20) return;
  selectedHeight = h;
  // Deselect preset buttons
  clearHeightButtons();
  recalculate();
}

function clearHeightButtons() {
  document.querySelectorAll('.height-options .height-btn').forEach(function(b) {
    b.classList.remove('active');
  });
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

const MULCH_BASE = {
  hardwood: { name: 'Hardwood Mulch', bagCuFt: 2, bagCost: 3.97, bulkCuYdCost: 30 },
  cedar: { name: 'Cedar Mulch', bagCuFt: 2, bagCost: 4.47, bulkCuYdCost: 45 },
  cypress: { name: 'Cypress Mulch', bagCuFt: 2, bagCost: 3.97, bulkCuYdCost: 45 },
  'pine-bark': { name: 'Pine Bark Mulch', bagCuFt: 2, bagCost: 3.47, bulkCuYdCost: 30 },
  'dyed-black': { name: 'Dyed Black Mulch', bagCuFt: 2, bagCost: 3.97, bulkCuYdCost: 40 },
  'dyed-red': { name: 'Dyed Red Mulch', bagCuFt: 2, bagCost: 3.97, bulkCuYdCost: 40 },
  rubber: { name: 'Rubber Mulch', bagCuFt: 0.8, bagCost: 5.97, bulkCuYdCost: 110 },
  'river-rock': { name: 'River Rock', bagCuFt: 0.5, bagCost: 4.68, bulkCuYdCost: 85 },
  'pea-gravel': { name: 'Pea Gravel', bagCuFt: 0.5, bagCost: 4.68, bulkCuYdCost: 45 },
  'lava-rock': { name: 'Lava Rock', bagCuFt: 0.5, bagCost: 4.98, bulkCuYdCost: 100 }
};

// Build MULCH with regional multiplier applied
function buildRegionalMulch() {
  var mult = (typeof REGIONS !== 'undefined' && typeof companyRegion !== 'undefined' && REGIONS[companyRegion])
    ? REGIONS[companyRegion].multiplier : 1;
  var m = {};
  Object.keys(MULCH_BASE).forEach(function(k) {
    var b = MULCH_BASE[k];
    m[k] = { name: b.name, bagCuFt: b.bagCuFt, bagCost: Math.round(b.bagCost * mult * 100) / 100, bulkCuYdCost: Math.round(b.bulkCuYdCost * mult) };
  });
  return m;
}
var MULCH = buildRegionalMulch();

function calculatePolygonArea(points) {
  if (points.length < 3) return 0;
  var origin = points[0];
  var cosLat = Math.cos(origin.lat * Math.PI / 180);
  var metersPerDegLat = 111320;
  var metersPerDegLng = 111320 * cosLat;
  var xy = points.map(function(p) {
    return { x: (p.lng - origin.lng) * metersPerDegLng, y: (p.lat - origin.lat) * metersPerDegLat };
  });
  var area = 0;
  for (var i = 0; i < xy.length; i++) {
    var j = (i + 1) % xy.length;
    area += xy[i].x * xy[j].y;
    area -= xy[j].x * xy[i].y;
  }
  return Math.round(Math.abs(area) / 2 * 10.7639);
}

function calculatePolygonPerimeter(points) {
  if (points.length < 2) return 0;
  var total = 0;
  for (var i = 0; i < points.length; i++) {
    var j = (i + 1) % points.length;
    var p1 = points[i], p2 = points[j];
    var R = 6371000;
    var dLat = (p2.lat - p1.lat) * Math.PI / 180;
    var dLng = (p2.lng - p1.lng) * Math.PI / 180;
    var a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(p1.lat * Math.PI / 180) * Math.cos(p2.lat * Math.PI / 180) * Math.sin(dLng/2) * Math.sin(dLng/2);
    total += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }
  return Math.round(total * 3.28084);
}

function calculateMulchBOM(areaSqFt, materialType, depthInches, options) {
  options = options || {};
  var deliveryMode = options.deliveryMode || 'bags';
  var cp = options.customPricing || {};
  var mat = MULCH[materialType];
  if (!mat) return null;

  var cubicFeet = (areaSqFt * depthInches) / 12;
  var cubicYards = cubicFeet / 27;
  var items = [];
  var materialTotal = 0;

  function mp(key, fallback) {
    var path = 'mulch.' + materialType + '.' + key;
    return cp[path] !== undefined ? cp[path] : fallback;
  }

  if (deliveryMode === 'bulk') {
    items.push({ name: mat.name + ' (bulk)', qty: Math.ceil(cubicYards * 10) / 10, unit: 'cu yd', unitCost: mp('bulkCuYdCost', mat.bulkCuYdCost) });
  } else {
    items.push({ name: mat.name + ' (' + mat.bagCuFt + ' cu ft bags)', qty: Math.ceil(cubicFeet / mat.bagCuFt), unit: 'bags', unitCost: mp('bagCost', mat.bagCost) });
  }

  if (options.addFabric) {
    items.push({ name: 'Landscape fabric (3x50ft)', qty: Math.ceil(areaSqFt / 150), unit: 'rolls', unitCost: mp('fabricCost', 18) });
    items.push({ name: 'Fabric staples (75-pack)', qty: Math.ceil(areaSqFt / 2 / 75), unit: 'packs', unitCost: mp('stapleCost', 8) });
  }

  if (options.addEdging && options.perimeterFt) {
    items.push({ name: 'Landscape edging (20ft)', qty: Math.ceil(options.perimeterFt / 20), unit: 'ea', unitCost: mp('edgingCost', 12) });
    items.push({ name: 'Edging stakes', qty: Math.ceil(options.perimeterFt / 3), unit: 'ea', unitCost: mp('stakeCost', 1.50) });
  }

  var filtered = items.filter(function(i) { return i.qty > 0; }).map(function(i) {
    i.total = Math.round(i.qty * i.unitCost * 100) / 100;
    materialTotal += i.total;
    return i;
  });

  return { items: filtered, materialTotal: Math.round(materialTotal), cubicYards: Math.round(cubicYards * 10) / 10 };
}

// === Combined BOM across all sections ===
function calculateCombinedBOM() {
  if (sections.length === 0) return null;

  // If only one section, just calculate normally
  if (sections.length === 1) {
    var s = sections[0];
    var feet = getSectionFootage(s);
    if (feet === 0) return null;
    return calculateBOM(feet, s.fenceType || selectedFence.type, s.fenceHeight || selectedHeight);
  }

  // Multiple sections — calculate each, then merge items by name
  var allItems = [];
  var grandTotal = 0;
  var sectionHeaders = [];

  sections.forEach(function(s, idx) {
    var feet = getSectionFootage(s);
    if (feet === 0) return;

    var type = s.fenceType || 'wood';
    var height = s.fenceHeight || 6;
    var bom = calculateBOM(feet, type, height);
    if (!bom) return;

    sectionHeaders.push({
      name: 'Section ' + (idx + 1) + ': ' + type.charAt(0).toUpperCase() + type.slice(1) + ' ' + height + 'ft (' + feet + ' ft)',
      isHeader: true
    });

    bom.items.forEach(function(item) {
      allItems.push(item);
    });
    grandTotal += bom.materialTotal;
  });

  if (allItems.length === 0) return null;

  // Interleave headers with items
  var result = [];
  var itemIdx = 0;
  sections.forEach(function(s, idx) {
    var feet = getSectionFootage(s);
    if (feet === 0) return;

    var type = s.fenceType || 'wood';
    var height = s.fenceHeight || 6;
    var bom = calculateBOM(feet, type, height);
    if (!bom) return;

    result.push({
      name: 'Section ' + (idx + 1) + ': ' + type.charAt(0).toUpperCase() + type.slice(1) + ' ' + height + 'ft — ' + feet + ' ft',
      qty: 0, unit: '', unitCost: 0, total: 0, isHeader: true
    });

    bom.items.forEach(function(item) {
      result.push(item);
    });
  });

  return { items: result, materialTotal: grandTotal };
}

function getSectionFootage(s) {
  var totalMeters = 0;
  var pts = s.points;

  if (s.curveMode && pts.length >= 3) {
    var spline = getSplinePoints(pts, s.closed);
    for (var i = 1; i < spline.length; i++) {
      totalMeters += spline[i - 1].distanceTo(spline[i]);
    }
  } else {
    for (var i = 1; i < pts.length; i++) {
      totalMeters += pts[i - 1].distanceTo(pts[i]);
    }
    if (s.closed && pts.length > 2) {
      totalMeters += pts[pts.length - 1].distanceTo(pts[0]);
    }
  }
  return Math.round(totalMeters * 3.28084);
}

// === BOM Calculation ===
function getNearestHeight(spec, height) {
  // If exact match exists, use it
  if (spec.heights[height]) return { data: spec.heights[height], multiplier: 1 };
  // Otherwise find nearest and scale
  var available = Object.keys(spec.heights).map(Number).sort(function(a, b) { return a - b; });
  var nearest = available[0];
  var minDiff = Math.abs(height - nearest);
  for (var i = 1; i < available.length; i++) {
    var diff = Math.abs(height - available[i]);
    if (diff < minDiff) { minDiff = diff; nearest = available[i]; }
  }
  // Scale factor for cost (taller = more expensive proportionally)
  var multiplier = height / nearest;
  return { data: spec.heights[nearest], multiplier: multiplier, nearestHeight: nearest };
}

// Concrete bag weight options: weight in lbs, quantity multiplier vs 50lb, cost per bag
var CONCRETE_OPTIONS = {
  40:  { label: '40lb', qtyMult: 1.25, cost: 4.50 },
  50:  { label: '50lb', qtyMult: 1.00, cost: 6.00 },
  60:  { label: '60lb', qtyMult: 0.83, cost: 7.00 },
  80:  { label: '80lb', qtyMult: 0.625, cost: 8.50 },
  90:  { label: '90lb', qtyMult: 0.56, cost: 9.50 }
};
var selectedConcreteWeight = parseInt(localStorage.getItem('fc_concrete_weight') || '50');

function setConcreteWeight(weight) {
  selectedConcreteWeight = parseInt(weight);
  localStorage.setItem('fc_concrete_weight', selectedConcreteWeight);
  recalculate();
}

function calculateBOM(feet, fenceType, height) {
  const spec = BOM[fenceType];
  if (!spec) return null;

  var resolved = getNearestHeight(spec, height);
  const h = resolved.data;
  var heightScale = resolved.multiplier;
  const ex = spec.extras;
  const sections = Math.max(0, Math.ceil(feet / spec.postSpacing));
  const posts = sections + 1;
  const items = [];
  let materialTotal = 0;

  // Get regional + pricebook pricing
  var customPricing = (typeof getEffectivePricing === 'function') ? getEffectivePricing() : {};

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

    var postLabel = heightScale !== 1 ? 'PT posts (' + height + 'ft)' : h.postLength + ' posts';
    var picketLabel = heightScale !== 1 ? 'Dog ear PT pickets (' + height + 'ft)' : h.picketDesc + ' pickets';
    items.push({ name: postLabel, qty: posts, unit: 'ea', unitCost: Math.round(p('postCost', h.postCost) * heightScale * 100) / 100 });
    items.push({ name: h.railDesc + ' rails', qty: totalRails, unit: 'ea', unitCost: p('railCost', h.railCost) });
    items.push({ name: picketLabel, qty: totalPickets, unit: 'ea', unitCost: Math.round(p('picketCost', h.picketCost) * heightScale * 100) / 100 });
    items.push({ name: 'Rail brackets', qty: totalBrackets, unit: 'ea', unitCost: pe('bracketCost', ex.bracketCost) });
    items.push({ name: 'Post caps', qty: posts, unit: 'ea', unitCost: pe('postCapCost', ex.postCapCost) });
    var cOpt = CONCRETE_OPTIONS[selectedConcreteWeight] || CONCRETE_OPTIONS[50];
    var adjConcrete = Math.ceil(totalConcrete * cOpt.qtyMult);
    items.push({ name: cOpt.label + ' concrete bags', qty: adjConcrete, unit: 'bags', unitCost: pe('concreteBagCost', cOpt.cost) });
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
    var cOpt = CONCRETE_OPTIONS[selectedConcreteWeight] || CONCRETE_OPTIONS[50];
    var adjConcrete = Math.ceil(totalConcrete * cOpt.qtyMult);
    items.push({ name: cOpt.label + ' concrete bags', qty: adjConcrete, unit: 'bags', unitCost: pe('concreteBagCost', cOpt.cost) });
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
    var cOpt = CONCRETE_OPTIONS[selectedConcreteWeight] || CONCRETE_OPTIONS[50];
    var adjConcrete = Math.ceil(totalConcrete * cOpt.qtyMult);
    items.push({ name: cOpt.label + ' concrete bags', qty: adjConcrete, unit: 'bags', unitCost: pe('concreteBagCost', cOpt.cost) });
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
    var cOpt = CONCRETE_OPTIONS[selectedConcreteWeight] || CONCRETE_OPTIONS[50];
    var adjConcrete = Math.ceil(totalConcrete * cOpt.qtyMult);
    items.push({ name: cOpt.label + ' concrete bags', qty: adjConcrete, unit: 'bags', unitCost: pe('concreteBagCost', cOpt.cost) });
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
    var cOpt = CONCRETE_OPTIONS[selectedConcreteWeight] || CONCRETE_OPTIONS[50];
    var adjConcrete = Math.ceil(totalConcrete * cOpt.qtyMult);
    items.push({ name: cOpt.label + ' concrete bags', qty: adjConcrete, unit: 'bags', unitCost: pe('concreteBagCost', cOpt.cost) });
  }

  // Filter out zero-qty items and calculate totals
  const filtered = items.filter(i => i.qty > 0).map(i => {
    i.total = Math.round(i.qty * i.unitCost * 100) / 100;
    materialTotal += i.total;
    return i;
  });

  return { items: filtered, materialTotal: Math.round(materialTotal) };
}

// Track manual qty overrides
var bomQtyOverrides = {};

function renderBOM(bom) {
  const container = document.getElementById('bom-list');
  if (!bom || bom.items.length === 0) {
    container.innerHTML = '<p class="empty-state">' + t('bom_empty') + '</p>';
    document.getElementById('bom-total').textContent = '$0';
    return;
  }

  // Apply qty and price overrides
  bom.items.forEach(function(i) {
    if (i.isHeader) return;
    if (bomQtyOverrides[i.name] !== undefined) i.qty = bomQtyOverrides[i.name];
    if (bomPriceOverrides[i.name] !== undefined) i.unitCost = bomPriceOverrides[i.name];
    i.total = Math.round(i.qty * i.unitCost * 100) / 100;
  });

  // Recalc total
  bom.materialTotal = bom.items.reduce(function(sum, i) { return sum + i.total; }, 0);
  bom.materialTotal = Math.round(bom.materialTotal);

  container.innerHTML = bom.items.map(function(i) {
    if (i.isHeader) {
      return '<div class="bom-section-header">' + escapeHtml(i.name) + '</div>';
    }
    var eName = i.name.replace(/'/g, "\\'");
    return '<div class="bom-row">' +
      '<div class="bom-name">' + escapeHtml(i.name) + '</div>' +
      '<div class="bom-fields">' +
        '<label class="bom-field"><span class="bom-field-label">Qty</span>' +
          '<input type="number" class="bom-qty" value="' + i.qty + '" min="0" ' +
            'onchange="updateBomQty(\'' + eName + '\', this.value)">' +
        '</label>' +
        '<label class="bom-field"><span class="bom-field-label">Price</span>' +
          '<input type="number" class="bom-price" value="' + i.unitCost.toFixed(2) + '" min="0" step="0.25" ' +
            'onchange="updateBomPrice(\'' + eName + '\', this.value)">' +
        '</label>' +
        '<span class="bom-cost">$' + i.total.toLocaleString() + '</span>' +
      '</div>' +
    '</div>';
  }).join('');

  document.getElementById('bom-total').textContent = '$' + bom.materialTotal.toLocaleString();
}

function updateBomQty(name, value) {
  var qty = parseInt(value) || 0;
  bomQtyOverrides[name] = qty;
  recalculate();
}

var bomPriceOverrides = {};

function updateBomPrice(name, value) {
  var price = parseFloat(value) || 0;
  bomPriceOverrides[name] = price;
  recalculate();
}

function resetBomOverrides() {
  bomQtyOverrides = {};
  bomPriceOverrides = {};
  recalculate();
}

// === Material List Export ===

function getExportBom() {
  saveActiveSection();
  var bom = calculateCombinedBOM();
  var mulchResult = calculateMulchTotal();
  var items = [];

  if (bom && bom.items.length > 0) {
    bom.items.forEach(function(i) {
      if (i.isHeader) {
        items.push({ name: i.name, qty: 0, unit: '', unitCost: 0, total: 0, isHeader: true });
      } else {
        var qty = bomQtyOverrides[i.name] !== undefined ? bomQtyOverrides[i.name] : i.qty;
        var unitCost = bomPriceOverrides[i.name] !== undefined ? bomPriceOverrides[i.name] : i.unitCost;
        var total = Math.round(qty * unitCost * 100) / 100;
        items.push({ name: i.name, qty: qty, unit: i.unit, unitCost: unitCost, total: total });
      }
    });
  }

  if (mulchResult && mulchResult.details.length > 0) {
    items.push({ name: 'Mulch / Landscaping', qty: 0, unit: '', unitCost: 0, total: 0, isHeader: true });
    mulchResult.details.forEach(function(d) {
      d.bom.items.forEach(function(i) {
        var qty = bomQtyOverrides[i.name] !== undefined ? bomQtyOverrides[i.name] : i.qty;
        var unitCost = bomPriceOverrides[i.name] !== undefined ? bomPriceOverrides[i.name] : i.unitCost;
        var total = Math.round(qty * unitCost * 100) / 100;
        items.push({ name: i.name, qty: qty, unit: i.unit, unitCost: unitCost, total: total });
      });
    });
  }

  var validCustom = customItems.filter(function(i) { return i.name && i.qty > 0; });
  if (validCustom.length > 0) {
    items.push({ name: 'Custom Items', qty: 0, unit: '', unitCost: 0, total: 0, isHeader: true });
    validCustom.forEach(function(i) {
      items.push({ name: i.name, qty: i.qty, unit: 'ea', unitCost: i.unitCost, total: Math.round(i.qty * i.unitCost * 100) / 100 });
    });
  }

  return items;
}

function toggleExportMenu(btn) {
  var menu = btn.parentElement.querySelector('.export-menu');
  var isVisible = menu.style.display !== 'none';
  menu.style.display = isVisible ? 'none' : 'block';
  if (!isVisible) {
    var close = function(e) {
      if (!menu.contains(e.target) && e.target !== btn) {
        menu.style.display = 'none';
        document.removeEventListener('click', close);
      }
    };
    setTimeout(function() { document.addEventListener('click', close); }, 0);
  }
}

function exportBomCsv() {
  var items = getExportBom();
  if (items.length === 0) { alert('No materials to export.'); return; }

  var custName = document.getElementById('cust-name').value || '';
  var custAddr = document.getElementById('cust-address').value || '';
  var lines = [];
  lines.push('Material List');
  if (custName) lines.push('Customer: ' + custName);
  if (custAddr) lines.push('Address: ' + custAddr);
  lines.push('Date: ' + new Date().toLocaleDateString());
  lines.push('');
  lines.push('"Item","Qty","Unit","Unit Cost","Total"');

  var grandTotal = 0;
  items.forEach(function(i) {
    if (i.isHeader) {
      lines.push('');
      lines.push('"' + i.name.replace(/"/g, '""') + '",,,,');
    } else {
      lines.push('"' + i.name.replace(/"/g, '""') + '",' + i.qty + ',"' + i.unit + '",' + i.unitCost.toFixed(2) + ',' + i.total.toFixed(2));
      grandTotal += i.total;
    }
  });
  lines.push('');
  lines.push('"TOTAL",,,,'+grandTotal.toFixed(2));
  lines.push('');
  lines.push('"Generated by FenceTrace"');

  var csv = lines.join('\n');
  var blob = new Blob([csv], { type: 'text/csv' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  var filename = (custName || 'material-list').replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
  a.download = filename + '-materials.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  document.querySelector('.export-menu').style.display = 'none';
}

function exportBomClipboard() {
  var items = getExportBom();
  if (items.length === 0) { alert('No materials to export.'); return; }

  var custName = document.getElementById('cust-name').value || '';
  var custAddr = document.getElementById('cust-address').value || '';
  var lines = [];
  lines.push('Material List');
  if (custName) lines.push('Customer: ' + custName);
  if (custAddr) lines.push('Address: ' + custAddr);
  lines.push('');

  items.forEach(function(i) {
    if (i.isHeader) {
      lines.push('--- ' + i.name + ' ---');
    } else {
      lines.push(i.qty + ' ' + i.name);
    }
  });
  lines.push('');
  lines.push('Generated by FenceTrace');

  var text = lines.join('\n');
  navigator.clipboard.writeText(text).then(function() {
    alert('Material list copied to clipboard.');
  }).catch(function() {
    prompt('Copy this material list:', text);
  });

  document.querySelector('.export-menu').style.display = 'none';
}

function exportBomEmail() {
  var items = getExportBom();
  if (items.length === 0) { alert('No materials to export.'); return; }

  var custName = document.getElementById('cust-name').value || '';
  var custAddr = document.getElementById('cust-address').value || '';
  var lines = [];
  lines.push('Material List');
  if (custName) lines.push('Customer: ' + custName);
  if (custAddr) lines.push('Address: ' + custAddr);
  lines.push('');

  items.forEach(function(i) {
    if (i.isHeader) {
      lines.push('--- ' + i.name + ' ---');
    } else {
      lines.push(i.qty + ' ' + i.name);
    }
  });
  lines.push('');
  lines.push('Generated by FenceTrace');

  var body = lines.join('\n');
  var subject = 'Material List' + (custName ? ' - ' + custName : '');
  var mailto = 'mailto:?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);

  if (mailto.length > 2000) {
    navigator.clipboard.writeText(body).then(function() {
      alert('Material list is too long for email link. It has been copied to your clipboard instead.');
    }).catch(function() {
      prompt('Material list is too long for email. Copy it here:', body);
    });
  } else {
    window.location.href = mailto;
  }

  document.querySelector('.export-menu').style.display = 'none';
}

// === Custom Line Items ===
function addCustomItem() {
  customItems.push({ id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Date.now() + Math.random(), name: '', qty: 1, unitCost: 0 });
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
      <input type="text" placeholder="Item name" value="${escapeHtml(i.name)}" onchange="updateCustomItem(${i.id},'name',this.value)" class="ci-name">
      <input type="number" placeholder="Qty" value="${i.qty}" onchange="updateCustomItem(${i.id},'qty',this.value)" class="ci-qty">
      <span class="ci-dollar">$<input type="number" placeholder="0" value="${i.unitCost}" onchange="updateCustomItem(${i.id},'unitCost',this.value)" class="ci-cost"></span>
      <button class="gate-remove" onclick="removeCustomItem(${i.id})">&times;</button>
    </div>
  `).join('');
}

// === Pricing Editor ===
function showPricingEditor() {
  if (typeof requireAuth === 'function' && !requireAuth('customize pricing')) return;
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

// === Mulch Tool Functions ===
function selectMulchMaterial(type, btn) {
  selectedMulchMaterial = type;
  document.querySelectorAll('.mulch-material-options .height-btn').forEach(function(b) { b.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  var mat = MULCH[type];
  if (mat) {
    var bagField = document.getElementById('mulch-bag-price');
    if (bagField) bagField.value = (customPricing['mulch.' + type + '.bagCost'] || mat.bagCost).toFixed(2);
    var bulkField = document.getElementById('mulch-bulk-price');
    if (bulkField) bulkField.value = (customPricing['mulch.' + type + '.bulkCuYdCost'] || mat.bulkCuYdCost).toFixed(2);
  }
  recalculate();
}

function updateMulchBagPrice(value) {
  var price = parseFloat(value);
  if (isNaN(price) || price < 0) return;
  customPricing['mulch.' + selectedMulchMaterial + '.bagCost'] = price;
  saveCustomPricing();
  recalculate();
}

function updateMulchBulkPrice(value) {
  var price = parseFloat(value);
  if (isNaN(price) || price < 0) return;
  customPricing['mulch.' + selectedMulchMaterial + '.bulkCuYdCost'] = price;
  saveCustomPricing();
  recalculate();
}

function selectMulchDepth(depth, btn) {
  selectedMulchDepth = depth;
  document.querySelectorAll('#mulch-depth-options .height-btn').forEach(function(b) { b.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  recalculate();
}

function selectMulchDelivery(mode, btn) {
  selectedMulchDelivery = mode;
  document.querySelectorAll('#mulch-delivery-options .height-btn').forEach(function(b) { b.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  var bagLabel = document.getElementById('mulch-bag-price-label');
  var bulkLabel = document.getElementById('mulch-bulk-price-label');
  if (bagLabel) bagLabel.style.display = mode === 'bags' ? 'flex' : 'none';
  if (bulkLabel) bulkLabel.style.display = mode === 'bulk' ? 'flex' : 'none';
  recalculate();
}

// --- Click-drag rectangle mode (default) ---
function initMulchDragHandlers() {
  // Use Leaflet events instead of raw DOM to avoid stealing events from other tools
  map.on('mousedown', function(e) {
    if (currentTool !== 'mulch' || (e.originalEvent && e.originalEvent.shiftKey)) return;
    if (e.originalEvent && e.originalEvent.button !== 0) return;
    if (_mulchMarkerDragging) return;

    mulchDragStart = e.latlng;
    map.dragging.disable();
    if (mulchDragRect) { map.removeLayer(mulchDragRect); mulchDragRect = null; }
  });

  map.on('mousemove', function(e) {
    if (!mulchDragStart || currentTool !== 'mulch') return;
    var bounds = L.latLngBounds(mulchDragStart, e.latlng);
    if (mulchDragRect) {
      mulchDragRect.setBounds(bounds);
    } else {
      mulchDragRect = L.rectangle(bounds, {
        color: '#2d8a4e', fillColor: '#2d8a4e', fillOpacity: 0.2, weight: 2, dashArray: '6,4'
      }).addTo(map);
    }
  });

  map.on('mouseup', function(e) {
    if (!mulchDragStart || currentTool !== 'mulch') return;
    map.dragging.enable();

    var startPx = map.latLngToContainerPoint(mulchDragStart);
    var endPx = map.latLngToContainerPoint(e.latlng);
    if (startPx.distanceTo(endPx) < 15) {
      if (mulchDragRect) { map.removeLayer(mulchDragRect); mulchDragRect = null; }
      mulchDragStart = null;
      return;
    }

    if (mulchDragRect) { map.removeLayer(mulchDragRect); mulchDragRect = null; }

    var sw = mulchDragStart;
    var ne = e.latlng;
    finalizeMulchArea([
      { lat: sw.lat, lng: sw.lng },
      { lat: sw.lat, lng: ne.lng },
      { lat: ne.lat, lng: ne.lng },
      { lat: ne.lat, lng: sw.lng }
    ]);
    mulchDragStart = null;
  });
}

// --- Shift+click polygon mode (for irregular shapes) ---
var _lastMulchTap = 0;
function addMulchPoint(latlng) {
  // Suppress if we just finished dragging a mulch corner/polygon/rotation handle
  if (_mulchMarkerDragging) return;
  // Debounce: ignore taps within 400ms
  var now = Date.now();
  if (now - _lastMulchTap < 400) return;
  _lastMulchTap = now;

  // Minimum distance: ignore taps too close to last point (prevents accidental doubles)
  if (activeMulchPoints.length > 0) {
    var lastPx = map.latLngToContainerPoint(activeMulchPoints[activeMulchPoints.length - 1]);
    var newPx = map.latLngToContainerPoint(latlng);
    if (lastPx.distanceTo(newPx) < 20) return;
  }

  activeMulchPoints.push(latlng);

  var marker = L.circleMarker(latlng, {
    radius: 6, color: '#2d8a4e', fillColor: '#2d8a4e', fillOpacity: 0.8, weight: 2
  }).addTo(map);
  activeMulchMarkers.push(marker);

  redrawActiveMulchPolygon();

  // Check if tapping near first point to close (larger radius for touch)
  if (activeMulchPoints.length > 3) {
    var first = map.latLngToContainerPoint(activeMulchPoints[0]);
    var clicked = map.latLngToContainerPoint(latlng);
    if (first.distanceTo(clicked) < 30) {
      activeMulchPoints.pop();
      map.removeLayer(activeMulchMarkers.pop());
      closeMulchArea();
      return;
    }
  }

  // Show close button when we have enough points
  if (activeMulchPoints.length >= 3) {
    showMulchDoneBtn();
  }

  if (activeMulchPoints.length === 1) {
    showToast('Tap corners to outline the mulch bed');
  } else if (activeMulchPoints.length === 3) {
    showToast('Tap first point or press Done to close');
  }

  markUnsaved();
}

function showMulchDoneBtn() {
  if (document.getElementById('mulch-done-btn')) return;
  var btn = document.createElement('button');
  btn.id = 'mulch-done-btn';
  btn.textContent = 'Done ✓';
  btn.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:9000;padding:12px 32px;background:var(--accent,#2d8a4e);color:#fff;border:none;border-radius:24px;font-size:1rem;font-weight:700;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.3)';
  btn.style.background = '#2d8a4e';
  btn.onclick = function() { closeMulchArea(); hideMulchDoneBtn(); };
  document.body.appendChild(btn);
}

function hideMulchDoneBtn() {
  var btn = document.getElementById('mulch-done-btn');
  if (btn) btn.remove();
}

// === Shape Presets ===
// Generates polygon points for common landscape bed shapes, centered on given lat/lng.
// sizeFt controls the rough diameter/width in feet. Returns array of {lat, lng}.
function generateShapePoints(shapeName, centerLat, centerLng, sizeFt) {
  // Convert feet to approximate lat/lng offset
  var ftToLat = 1 / 364000; // ~1 foot in degrees latitude
  var ftToLng = ftToLat / Math.cos(centerLat * Math.PI / 180);
  var r = sizeFt / 2;
  var pts = [];
  var i, angle, n;

  switch (shapeName) {
    case 'circle':
      n = 8;
      for (i = 0; i < n; i++) {
        angle = (2 * Math.PI * i) / n;
        pts.push({ lat: centerLat + Math.sin(angle) * r * ftToLat, lng: centerLng + Math.cos(angle) * r * ftToLng });
      }
      break;

    case 'oval':
      n = 8;
      var rx = r * 1.5, ry = r * 0.75;
      for (i = 0; i < n; i++) {
        angle = (2 * Math.PI * i) / n;
        pts.push({ lat: centerLat + Math.sin(angle) * ry * ftToLat, lng: centerLng + Math.cos(angle) * rx * ftToLng });
      }
      break;

    case 'kidney':
      n = 8;
      for (i = 0; i < n; i++) {
        angle = (2 * Math.PI * i) / n;
        var kr = r * (1 - 0.35 * Math.pow(Math.sin(angle), 2) * (Math.cos(angle) > 0 ? 1 : 0));
        var sx = 1.4, sy = 0.8;
        pts.push({ lat: centerLat + Math.sin(angle) * kr * sy * ftToLat, lng: centerLng + Math.cos(angle) * kr * sx * ftToLng });
      }
      break;

    case 'l-shape':
      // L-shape: two rectangles joined at corner
      var w = r * 0.5;
      pts = [
        { lat: centerLat + r * ftToLat, lng: centerLng - r * ftToLng },
        { lat: centerLat + r * ftToLat, lng: centerLng + w * ftToLng },
        { lat: centerLat - w * ftToLat, lng: centerLng + w * ftToLng },
        { lat: centerLat - w * ftToLat, lng: centerLng + r * ftToLng },
        { lat: centerLat - r * ftToLat, lng: centerLng + r * ftToLng },
        { lat: centerLat - r * ftToLat, lng: centerLng - r * ftToLng }
      ];
      break;

    case 'crescent':
      n = 8;
      for (i = 0; i < n; i++) {
        angle = (2 * Math.PI * i) / n;
        // Outer circle minus offset inner circle
        var outerR = r;
        var innerR = r * 0.6;
        var offsetX = r * 0.35;
        // Use outer for top half, inner (offset) for bottom half
        if (Math.sin(angle) >= 0) {
          pts.push({ lat: centerLat + Math.sin(angle) * outerR * 0.7 * ftToLat, lng: centerLng + Math.cos(angle) * outerR * 1.3 * ftToLng });
        } else {
          pts.push({ lat: centerLat + Math.sin(angle) * innerR * 0.5 * ftToLat, lng: centerLng + Math.cos(angle) * innerR * 1.1 * ftToLng + offsetX * ftToLng });
        }
      }
      break;

    case 'teardrop':
      n = 8;
      for (i = 0; i < n; i++) {
        angle = (2 * Math.PI * i) / n;
        // Teardrop: circle that tapers to a point on one side
        var tr = r * (1 - 0.5 * (1 + Math.cos(angle)) / 2);
        tr = Math.max(tr, r * 0.1);
        pts.push({ lat: centerLat + Math.sin(angle) * tr * ftToLat, lng: centerLng + Math.cos(angle) * r * ftToLng });
      }
      break;

    case 'square':
      pts = [
        { lat: centerLat - r * ftToLat, lng: centerLng - r * ftToLng },
        { lat: centerLat - r * ftToLat, lng: centerLng + r * ftToLng },
        { lat: centerLat + r * ftToLat, lng: centerLng + r * ftToLng },
        { lat: centerLat + r * ftToLat, lng: centerLng - r * ftToLng }
      ];
      break;

    case 'rectangle':
      var rw = r * 1.6, rh = r * 0.7;
      pts = [
        { lat: centerLat - rh * ftToLat, lng: centerLng - rw * ftToLng },
        { lat: centerLat - rh * ftToLat, lng: centerLng + rw * ftToLng },
        { lat: centerLat + rh * ftToLat, lng: centerLng + rw * ftToLng },
        { lat: centerLat + rh * ftToLat, lng: centerLng - rw * ftToLng }
      ];
      break;

    default:
      pts = [
        { lat: centerLat - r * ftToLat, lng: centerLng - r * ftToLng },
        { lat: centerLat - r * ftToLat, lng: centerLng + r * ftToLng },
        { lat: centerLat + r * ftToLat, lng: centerLng + r * ftToLng },
        { lat: centerLat + r * ftToLat, lng: centerLng - r * ftToLng }
      ];
  }
  return pts;
}

// Default real-world sizes per shape (feet) — based on typical landscape beds
var shapeDefaultSizes = {
  square: 10, rectangle: 15, circle: 8, oval: 12,
  kidney: 14, 'l-shape': 12, crescent: 12, teardrop: 10
};

function placeShape(shapeName) {
  var center = map.getCenter();
  var sizeFt = shapeDefaultSizes[shapeName] || 12;
  var points = generateShapePoints(shapeName, center.lat, center.lng, sizeFt);
  setTool('mulch');
  finalizeMulchArea(points);
  hideShapePicker();
  // Zoom in if too far out to see the shape
  if (map.getZoom() < 19) {
    map.setView(center, 19, { animate: true });
  }
  showToast('Shape placed (~' + sizeFt + 'ft) — drag corners to resize');
}

function showShapePicker() {
  var el = document.getElementById('shape-picker');
  if (!el) return;
  if (el.style.display === 'flex') { el.style.display = 'none'; return; }
  el.style.display = 'flex';
  // Close on outside click
  setTimeout(function() {
    document.addEventListener('click', function closeShapePicker(e) {
      if (!el.contains(e.target) && e.target.id !== 'shapes-btn' && !e.target.closest('#shapes-btn')) {
        el.style.display = 'none';
        document.removeEventListener('click', closeShapePicker);
      }
    });
  }, 10);
}
function hideShapePicker() {
  var el = document.getElementById('shape-picker');
  if (el) el.style.display = 'none';
}

// Sort points by angle from centroid so the polygon never criss-crosses
function sortPointsByAngle(pts) {
  if (pts.length < 3) return pts;
  var cx = 0, cy = 0;
  pts.forEach(function(p) { cx += p.lat; cy += p.lng; });
  cx /= pts.length; cy /= pts.length;
  return pts.slice().sort(function(a, b) {
    return Math.atan2(a.lat - cx, a.lng - cy) - Math.atan2(b.lat - cx, b.lng - cy);
  });
}

function redrawActiveMulchPolygon() {
  if (activeMulchPolygon) { map.removeLayer(activeMulchPolygon); activeMulchPolygon = null; }
  if (activeMulchPoints.length >= 3) {
    activeMulchPolygon = L.polygon(sortPointsByAngle(activeMulchPoints), {
      color: '#2d8a4e', fillColor: '#2d8a4e', fillOpacity: 0.2, weight: 2, dashArray: '6,4'
    }).addTo(map);
  }
}

function closeMulchArea() {
  hideMulchDoneBtn();
  if (activeMulchPoints.length < 3) {
    showToast('Need at least 3 points to create an area');
    return;
  }
  var pts = sortPointsByAngle(activeMulchPoints.map(function(p) { return { lat: p.lat, lng: p.lng }; }));

  // Clean up active polygon preview
  if (activeMulchPolygon) map.removeLayer(activeMulchPolygon);
  activeMulchMarkers.forEach(function(m) { map.removeLayer(m); });
  activeMulchPoints = [];
  activeMulchMarkers = [];
  activeMulchPolygon = null;

  finalizeMulchArea(pts);
}

// Check if a point is inside a polygon (ray casting)
function pointInPolygon(pt, poly) {
  var inside = false;
  for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    var xi = poly[i].lng, yi = poly[i].lat;
    var xj = poly[j].lng, yj = poly[j].lat;
    if (((yi > pt.lat) !== (yj > pt.lat)) && (pt.lng < (xj - xi) * (pt.lat - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

// Check if two polygons overlap (any vertex inside the other, or edges intersect)
function polygonsOverlap(polyA, polyB) {
  for (var i = 0; i < polyA.length; i++) {
    if (pointInPolygon(polyA[i], polyB)) return true;
  }
  for (var i = 0; i < polyB.length; i++) {
    if (pointInPolygon(polyB[i], polyA)) return true;
  }
  return false;
}

// Convex hull of a set of points (Graham scan)
function convexHull(points) {
  if (points.length <= 3) return points;
  var pts = points.slice().sort(function(a, b) { return a.lng - b.lng || a.lat - b.lat; });

  var lower = [];
  for (var i = 0; i < pts.length; i++) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pts[i]) <= 0) lower.pop();
    lower.push(pts[i]);
  }
  var upper = [];
  for (var i = pts.length - 1; i >= 0; i--) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pts[i]) <= 0) upper.pop();
    upper.push(pts[i]);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function cross(o, a, b) {
  return (a.lng - o.lng) * (b.lat - o.lat) - (a.lat - o.lat) * (b.lng - o.lng);
}

// Find all existing areas that overlap with new points, merge them all
function mergeOverlappingAreas(newPoints) {
  var toMerge = [];
  for (var i = mulchAreas.length - 1; i >= 0; i--) {
    if (polygonsOverlap(newPoints, mulchAreas[i].points)) {
      toMerge.push(i);
    }
  }
  if (toMerge.length === 0) return newPoints;

  // Collect all points from overlapping areas + new area
  var allPts = newPoints.slice();
  toMerge.forEach(function(idx) {
    mulchAreas[idx].points.forEach(function(p) { allPts.push({ lat: p.lat, lng: p.lng }); });
  });

  // Remove overlapping areas from map (highest index first so splice doesn't shift)
  toMerge.sort(function(a, b) { return b - a; });
  toMerge.forEach(function(idx) {
    var area = mulchAreas[idx];
    area.markers.forEach(function(m) { map.removeLayer(m); });
    if (area.polygon) map.removeLayer(area.polygon);
    if (area.areaLabel) map.removeLayer(area.areaLabel);
    if (area.mulchLeaderLine) map.removeLayer(area.mulchLeaderLine);
    if (area.rotMarker) map.removeLayer(area.rotMarker);
    if (area.rotLine) map.removeLayer(area.rotLine);
    mulchAreas.splice(idx, 1);
  });

  return convexHull(allPts);
}

function getMulchLabelHtml(areaSqFt, points) {
  var mat = MULCH[selectedMulchMaterial];
  if (!mat) return '<div class="mulch-label">' + fmtArea(areaSqFt) + '</div>';

  var cubicFeet = (areaSqFt * selectedMulchDepth) / 12;
  var line2 = '';
  if (selectedMulchDelivery === 'bags') {
    var bags = Math.ceil(cubicFeet / mat.bagCuFt);
    line2 = bags + ' bags';
  } else {
    var cuYd = Math.ceil(cubicFeet / 27 * 10) / 10;
    line2 = useMetric ? (Math.round(cuYd * 0.7646 * 10) / 10) + ' m³' : cuYd + ' cu yd';
  }

  // If 4 points (rectangle), show dimensions
  var dims = '';
  if (points && points.length === 4) {
    var R = 6371000;
    var dLat = (points[1].lat - points[0].lat) * Math.PI / 180;
    var dLng = (points[1].lng - points[0].lng) * Math.PI / 180;
    var a1 = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(points[0].lat*Math.PI/180)*Math.cos(points[1].lat*Math.PI/180)*Math.sin(dLng/2)*Math.sin(dLng/2);
    var side1 = Math.round(R * 2 * Math.atan2(Math.sqrt(a1), Math.sqrt(1-a1)) * 3.28084);
    dLat = (points[2].lat - points[1].lat) * Math.PI / 180;
    dLng = (points[2].lng - points[1].lng) * Math.PI / 180;
    a1 = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(points[1].lat*Math.PI/180)*Math.cos(points[2].lat*Math.PI/180)*Math.sin(dLng/2)*Math.sin(dLng/2);
    var side2 = Math.round(R * 2 * Math.atan2(Math.sqrt(a1), Math.sqrt(1-a1)) * 3.28084);
    dims = '<span style="font-size:10px;opacity:0.7">' + fmtLen(side1) + '×' + fmtLen(side2) + '</span><br>';
  }

  return '<div class="mulch-label">' + dims + fmtArea(areaSqFt) + '<br><span style="font-size:10px;opacity:0.8">' + line2 + '</span></div>';
}

function finalizeMulchArea(points) {
  // Merge with any overlapping existing areas
  points = mergeOverlappingAreas(points);

  var areaSqFt = calculatePolygonArea(points);
  var perimeterFt = calculatePolygonPerimeter(points);

  if (areaSqFt < 1) {
    showToast('Area too small');
    return;
  }

  // Create the polygon — interactive for drag-to-move
  var polygon = L.polygon(points, {
    color: '#00e64d', fillColor: '#00e64d', fillOpacity: 0.2, weight: 3,
    interactive: true, bubblingMouseEvents: false
  }).addTo(map);
  polygon.getElement && polygon.getElement() && (polygon.getElement().style.cursor = 'move');

  // Corner markers — bigger on touch devices for easier tapping
  var isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  var handleRadius = isMobile ? 10 : 5;
  var rotRadius = isMobile ? 12 : 6;

  var markers = points.map(function(p) {
    var m = L.circleMarker([p.lat, p.lng], {
      radius: handleRadius, color: '#2d8a4e', fillColor: '#fff', fillOpacity: 1, weight: 2,
      interactive: true, bubblingMouseEvents: false
    }).addTo(map);
    m.getElement && m.getElement() && (m.getElement().style.cursor = 'nwse-resize');
    return m;
  });

  // Rotation handle — positioned above the top-center of the shape
  var rotCenter = getMulchCenter(points);
  var rotHandlePos = getRotationHandlePos(points, rotCenter);
  var rotMarker = L.circleMarker(rotHandlePos, {
    radius: rotRadius, color: '#c0622e', fillColor: '#c0622e', fillOpacity: 0.9, weight: 2,
    interactive: true, bubblingMouseEvents: false
  }).addTo(map);
  rotMarker.getElement && rotMarker.getElement() && (rotMarker.getElement().style.cursor = 'grab');

  // Rotation line connecting center to handle
  var rotLine = L.polyline([rotCenter, rotHandlePos], {
    color: '#c0622e', weight: 1, dashArray: '4,4', opacity: 0.6
  }).addTo(map);

  // Area label — positioned at top edge, draggable with leader line
  var maxLat = Math.max.apply(null, points.map(function(p) { return p.lat; }));
  var labelAnchor = { lat: maxLat + 0.00003, lng: rotCenter.lng };
  var areaLabel = L.marker(labelAnchor, {
    icon: L.divIcon({
      className: 'mulch-area-label',
      html: getMulchLabelHtml(areaSqFt, points),
      iconSize: [120, 36],
      iconAnchor: [60, 36]
    }),
    interactive: true,
    draggable: !_isMobileDevice
  }).addTo(map);

  var mulchLeaderLine = L.polyline([[labelAnchor.lat, labelAnchor.lng], [labelAnchor.lat, labelAnchor.lng]], {
    color: '#2d8a4e', weight: 1, opacity: 0, dashArray: '4,4', interactive: false
  }).addTo(map);

  areaLabel._anchorLat = labelAnchor.lat;
  areaLabel._anchorLng = labelAnchor.lng;
  areaLabel._leaderLine = mulchLeaderLine;
  areaLabel._dragOffset = null;

  if (!_isMobileDevice) {
    // Desktop: drag to reposition
    areaLabel.on('drag', function() {
      var ll = areaLabel.getLatLng();
      mulchLeaderLine.setLatLngs([[areaLabel._anchorLat, areaLabel._anchorLng], [ll.lat, ll.lng]]);
      mulchLeaderLine.setStyle({ opacity: 0.6 });
    });
    areaLabel.on('dragend', function() {
      var ll = areaLabel.getLatLng();
      areaLabel._dragOffset = { dlat: ll.lat - areaLabel._anchorLat, dlng: ll.lng - areaLabel._anchorLng };
    });
  }

  var area = {
    points: points,
    markers: markers,
    polygon: polygon,
    areaLabel: areaLabel,
    mulchLeaderLine: mulchLeaderLine,
    rotMarker: rotMarker,
    rotLine: rotLine,
    areaSqFt: areaSqFt,
    perimeterFt: perimeterFt,
    materialType: selectedMulchMaterial,
    depth: selectedMulchDepth,
    deliveryMode: selectedMulchDelivery
  };
  mulchAreas.push(area);
  undoStack.push({ type: 'mulchArea', mulchIdx: mulchAreas.length - 1 });
  redoStack = []; // new action clears redo

  rebindMulchMarkerDrags(mulchAreas.length - 1);
  renderMulchAreas();
  recalculate();
  markUnsaved();

  showToast('Mulch area added — ' + areaSqFt.toLocaleString() + ' sq ft');

  var mulchSection = document.querySelector('[data-section="mulch"] .section-title.collapsed');
  if (mulchSection) toggleSection(mulchSection);
}

function getMulchCenter(points) {
  var latSum = 0, lngSum = 0;
  points.forEach(function(p) { latSum += p.lat; lngSum += p.lng; });
  return { lat: latSum / points.length, lng: lngSum / points.length };
}

function getRotationHandlePos(points, center) {
  // Find the topmost point and extend above it
  var maxLat = -Infinity;
  points.forEach(function(p) { if (p.lat > maxLat) maxLat = p.lat; });
  var offset = (maxLat - center.lat) * 0.4;
  return { lat: maxLat + offset, lng: center.lng };
}

function rotatePoint(point, center, angleDeg) {
  var rad = angleDeg * Math.PI / 180;
  var cos = Math.cos(rad), sin = Math.sin(rad);
  var dx = point.lng - center.lng;
  var dy = point.lat - center.lat;
  return {
    lat: center.lat + dy * cos - dx * sin,
    lng: center.lng + dx * cos + dy * sin
  };
}

function updateMulchAreaVisuals(area) {
  var newArea = calculatePolygonArea(area.points);
  area.areaSqFt = newArea;
  area.perimeterFt = calculatePolygonPerimeter(area.points);
  area.polygon.setLatLngs(area.points.map(function(p) { return [p.lat, p.lng]; }));
  area.markers.forEach(function(m, i) { m.setLatLng([area.points[i].lat, area.points[i].lng]); });
  var center = getMulchCenter(area.points);
  var maxLat = Math.max.apply(null, area.points.map(function(p) { return p.lat; }));
  var newAnchor = { lat: maxLat + 0.00003, lng: center.lng };
  area.areaLabel._anchorLat = newAnchor.lat;
  area.areaLabel._anchorLng = newAnchor.lng;
  var labelPos = newAnchor;
  if (area.areaLabel._dragOffset) {
    labelPos = { lat: newAnchor.lat + area.areaLabel._dragOffset.dlat, lng: newAnchor.lng + area.areaLabel._dragOffset.dlng };
  }
  area.areaLabel.setLatLng(labelPos);
  area.areaLabel.setIcon(L.divIcon({
    className: 'mulch-area-label',
    html: getMulchLabelHtml(newArea, area.points),
    iconSize: [120, 36], iconAnchor: [60, 36]
  }));
  if (area.mulchLeaderLine) {
    area.mulchLeaderLine.setLatLngs([[newAnchor.lat, newAnchor.lng], [labelPos.lat, labelPos.lng]]);
    area.mulchLeaderLine.setStyle({ opacity: area.areaLabel._dragOffset ? 0.6 : 0 });
  }
  var rotPos = getRotationHandlePos(area.points, center);
  area.rotMarker.setLatLng(rotPos);
  area.rotLine.setLatLngs([center, rotPos]);
}

// Touch-aware drag helper for Leaflet layers
function bindDrag(layer, onStart, onDrag, onEnd) {
  layer.off('mousedown touchstart');

  // Store handlers at function scope so they can be removed properly
  var _activeMoveHandler = null;
  var _activeEndHandler = null;
  var _activeTouchMoveHandler = null;
  var _activeTouchEndHandler = null;

  function startHandler(e) {
    // In delete mode, don't start drag — let click/tap handle selection
    if (_deleteMode) return;
    L.DomEvent.stopPropagation(e);
    map.dragging.disable();
    var latlng = e.latlng || (e.touches && map.containerPointToLatLng(L.point(e.touches[0].clientX - map.getContainer().getBoundingClientRect().left, e.touches[0].clientY - map.getContainer().getBoundingClientRect().top)));
    var ctx = onStart(latlng) || {};
    var _hasMoved = false;

    // Clean up any stale handlers
    if (_activeMoveHandler) map.off('mousemove', _activeMoveHandler);
    if (_activeEndHandler) map.off('mouseup', _activeEndHandler);
    if (_activeTouchMoveHandler) document.removeEventListener('touchmove', _activeTouchMoveHandler);
    if (_activeTouchEndHandler) document.removeEventListener('touchend', _activeTouchEndHandler);

    _activeMoveHandler = function(ev) {
      _hasMoved = true;
      var ll = ev.latlng || (ev.touches && map.containerPointToLatLng(L.point(ev.touches[0].clientX - map.getContainer().getBoundingClientRect().left, ev.touches[0].clientY - map.getContainer().getBoundingClientRect().top)));
      if (ll) onDrag(ll, ctx);
    };
    _activeEndHandler = function() {
      map.off('mousemove', _activeMoveHandler);
      map.off('mouseup', _activeEndHandler);
      document.removeEventListener('touchmove', _activeTouchMoveHandler);
      document.removeEventListener('touchend', _activeTouchEndHandler);
      document.removeEventListener('touchcancel', _activeTouchEndHandler);
      _activeMoveHandler = _activeEndHandler = _activeTouchMoveHandler = _activeTouchEndHandler = null;
      map.dragging.enable();
      if (onEnd) onEnd(ctx);
    };
    _activeTouchMoveHandler = function(te) {
      te.preventDefault();
      _hasMoved = true;
      var touch = te.touches[0];
      var rect = map.getContainer().getBoundingClientRect();
      var ll = map.containerPointToLatLng(L.point(touch.clientX - rect.left, touch.clientY - rect.top));
      onDrag(ll, ctx);
    };
    _activeTouchEndHandler = function() { _activeEndHandler(); };

    map.on('mousemove', _activeMoveHandler);
    map.on('mouseup', _activeEndHandler);
    document.addEventListener('touchmove', _activeTouchMoveHandler, { passive: false });
    document.addEventListener('touchend', _activeTouchEndHandler, { passive: false });
    document.addEventListener('touchcancel', _activeTouchEndHandler, { passive: false });
  }

  layer.on('mousedown', startHandler);
  // For touch, attach to the DOM element directly
  var el = layer.getElement ? layer.getElement() : null;
  if (el) {
    el.addEventListener('touchstart', function(te) {
      if (_deleteMode) return; // Let tap flow through for delete mode
      te.preventDefault();
      te.stopPropagation();
      var touch = te.touches[0];
      var rect = map.getContainer().getBoundingClientRect();
      var latlng = map.containerPointToLatLng(L.point(touch.clientX - rect.left, touch.clientY - rect.top));
      var fakeEvent = { latlng: latlng };
      startHandler(fakeEvent);
    }, { passive: false });
  }
}

function rebindMulchMarkerDrags(areaIdx) {
  var area = mulchAreas[areaIdx];
  if (!area) return;

  // Corner drag — move individual points
  area.markers.forEach(function(marker, ptIdx) {
    bindDrag(marker,
      function() { _mulchMarkerDragging = true; },
      function(ll) {
        area.points[ptIdx] = { lat: ll.lat, lng: ll.lng };
        marker.setLatLng(ll);
        updateMulchAreaVisuals(area);
      },
      function() { setTimeout(function() { _mulchMarkerDragging = false; }, 300); renderMulchAreas(); recalculate(); markUnsaved(); }
    );
  });

  // Track drag state to suppress click after drag/rotate
  var _wasDragged = false;
  function flagDragStart() { _wasDragged = true; _mulchMarkerDragging = true; }
  function flagDragEnd() { setTimeout(function() { _wasDragged = false; _mulchMarkerDragging = false; }, 300); }

  // Tap polygon to select/highlight with delete option
  var areaIndex = areaIdx;
  area.polygon.on('click', function(e) {
    if (_wasDragged && !_deleteMode) return;
    L.DomEvent.stopPropagation(e);
    if (_deleteMode) {
      selectMulchArea(areaIndex, e.latlng);
    }
  });

  // Polygon body drag — move the whole shape
  bindDrag(area.polygon,
    function(ll) { flagDragStart(); return { startLat: ll.lat, startLng: ll.lng, orig: area.points.map(function(p) { return { lat: p.lat, lng: p.lng }; }) }; },
    function(ll, ctx) {
      var dLat = ll.lat - ctx.startLat;
      var dLng = ll.lng - ctx.startLng;
      area.points = ctx.orig.map(function(p) { return { lat: p.lat + dLat, lng: p.lng + dLng }; });
      updateMulchAreaVisuals(area);
    },
    function() { flagDragEnd(); renderMulchAreas(); recalculate(); markUnsaved(); }
  );

  // Rotation handle drag
  bindDrag(area.rotMarker,
    function(ll) {
      flagDragStart();
      var center = getMulchCenter(area.points);
      return { center: center, startAngle: Math.atan2(ll.lng - center.lng, ll.lat - center.lat), orig: area.points.map(function(p) { return { lat: p.lat, lng: p.lng }; }) };
    },
    function(ll, ctx) {
      var curAngle = Math.atan2(ll.lng - ctx.center.lng, ll.lat - ctx.center.lat);
      var delta = (curAngle - ctx.startAngle) * 180 / Math.PI;
      area.points = ctx.orig.map(function(p) { return rotatePoint(p, ctx.center, delta); });
      updateMulchAreaVisuals(area);
    },
    function() {
      flagDragEnd();
      // Rebuild corner markers to prevent orphaned DOM elements
      rebuildMulchCorners(areaIdx);
      renderMulchAreas();
      recalculate();
      markUnsaved();
    }
  );

  // Corner drags also flag and rebuild after
  area.markers.forEach(function(marker) {
    marker.on('mousedown touchstart', flagDragStart);
  });
}

function rebuildMulchCorners(areaIdx) {
  var area = mulchAreas[areaIdx];
  if (!area) return;

  var isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  var handleRadius = isMobile ? 10 : 5;

  // Remove old markers completely
  area.markers.forEach(function(m) { map.removeLayer(m); });

  // Create fresh markers at current positions
  area.markers = area.points.map(function(p) {
    var m = L.circleMarker([p.lat, p.lng], {
      radius: handleRadius, color: '#2d8a4e', fillColor: '#fff', fillOpacity: 1, weight: 2,
      interactive: true, bubblingMouseEvents: false
    }).addTo(map);
    if (m.getElement) {
      var el = m.getElement();
      if (el) el.style.cursor = 'nwse-resize';
    }
    return m;
  });

  // Remove and recreate rotation handle
  if (area.rotMarker) map.removeLayer(area.rotMarker);
  if (area.rotLine) map.removeLayer(area.rotLine);

  var rotRadius = isMobile ? 12 : 6;
  var center = getMulchCenter(area.points);
  var rotPos = getRotationHandlePos(area.points, center);

  area.rotMarker = L.circleMarker(rotPos, {
    radius: rotRadius, color: '#c0622e', fillColor: '#c0622e', fillOpacity: 0.9, weight: 2,
    interactive: true, bubblingMouseEvents: false
  }).addTo(map);
  if (area.rotMarker.getElement) {
    var el = area.rotMarker.getElement();
    if (el) el.style.cursor = 'grab';
  }

  area.rotLine = L.polyline([center, rotPos], {
    color: '#c0622e', weight: 1, dashArray: '4,4', opacity: 0.6
  }).addTo(map);

  // Re-bind all drag handlers
  rebindMulchMarkerDrags(areaIdx);
}

// === Delete Mode & Selection ===
var _deleteMode = false;
var _selectedMulchIdx = -1;
var _selectedFenceSectionIdx = -1;
var _selectedGateIdx = -1;

function toggleDeleteMode() {
  _deleteMode = !_deleteMode;
  var btn = document.getElementById('delete-mode-btn');
  if (btn) btn.classList.toggle('active', _deleteMode);
  if (_deleteMode) {
    deselectAll();
    map.getContainer().style.cursor = 'crosshair';
    showDeleteModeBar();
    // Highlight all objects with a pulsing border
    mulchAreas.forEach(function(a) { if (a.polygon) a.polygon.setStyle({ weight: 4, dashArray: '8,4' }); });
    sections.forEach(function(s) { if (s.line) s.line.setStyle({ weight: 6, dashArray: '8,4' }); });
  } else {
    exitDeleteMode();
  }
}

function exitDeleteMode() {
  _deleteMode = false;
  var btn = document.getElementById('delete-mode-btn');
  if (btn) btn.classList.remove('active');
  map.getContainer().style.cursor = '';
  // Restore normal styles
  mulchAreas.forEach(function(a) { if (a.polygon) a.polygon.setStyle({ color: '#00e64d', fillColor: '#00e64d', fillOpacity: 0.2, weight: 3, dashArray: null }); });
  sections.forEach(function(s) { if (s.line) s.line.setStyle({ color: '#ff6b1a', weight: 4, dashArray: s.closed ? null : '10, 8' }); });
  deselectAll();
  hideDeleteModeBar();
}

function showDeleteModeBar() {
  var bar = document.getElementById('selection-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'selection-bar';
    bar.className = 'selection-bar';
    document.body.appendChild(bar);
  }
  bar.innerHTML = '<span class="selection-text">Tap an object to delete it</span>' +
    '<button class="selection-cancel-btn" onclick="exitDeleteMode()">Done</button>';
  bar.style.display = 'flex';
}

function selectMulchArea(idx, latlng) {
  if (!_deleteMode) return;
  deselectAll();
  var area = mulchAreas[idx];
  if (!area) return;
  _selectedMulchIdx = idx;
  area.polygon.setStyle({ color: '#ff4444', fillColor: '#ff4444', fillOpacity: 0.35, weight: 5, dashArray: null });
  showSelectionBar('Mulch Area ' + (idx + 1) + ' — ' + Math.round(area.areaSqFt).toLocaleString() + ' sq ft', function() {
    deselectAll();
    removeMulchArea(idx);
    if (mulchAreas.length > 0) {
      showDeleteModeBar();
    } else {
      exitDeleteMode();
    }
  });
}

function selectFenceSection(idx) {
  if (!_deleteMode) return;
  deselectAll();
  var s = sections[idx];
  if (!s || !s.line) return;
  _selectedFenceSectionIdx = idx;
  s.line.setStyle({ color: '#ff4444', weight: 6, dashArray: null });
  var feet = 0;
  for (var i = 1; i < s.points.length; i++) feet += s.points[i-1].distanceTo(s.points[i]) * 3.28084;
  if (s.closed && s.points.length > 2) feet += s.points[s.points.length-1].distanceTo(s.points[0]) * 3.28084;
  showSelectionBar('Section ' + (idx + 1) + ' — ' + Math.round(feet) + ' ft', function() {
    deselectAll();
    ensureSection(idx);
    removeSection(idx);
    if (sections.length > 0 && sections[0].points.length > 0) {
      showDeleteModeBar();
    } else {
      exitDeleteMode();
    }
  });
}

function selectGate(idx) {
  if (!_deleteMode) return;
  deselectAll();
  var g = gates[idx];
  if (!g) return;
  _selectedGateIdx = idx;
  showSelectionBar('Gate ' + (idx + 1), function() {
    deselectAll();
    gates.splice(idx, 1);
    renderGates();
    redrawFence();
    recalculate();
    showToast(t('toast_gate_removed'));
    if (gates.length > 0 || mulchAreas.length > 0 || sections.some(function(s) { return s.points.length > 0; })) {
      showDeleteModeBar();
    } else {
      exitDeleteMode();
    }
  });
}

function deselectAll() {
  if (_selectedMulchIdx >= 0 && mulchAreas[_selectedMulchIdx]) {
    var a = mulchAreas[_selectedMulchIdx];
    a.polygon.setStyle({ color: '#00e64d', fillColor: '#00e64d', fillOpacity: 0.2, weight: _deleteMode ? 4 : 3, dashArray: _deleteMode ? '8,4' : null });
  }
  if (_selectedFenceSectionIdx >= 0 && sections[_selectedFenceSectionIdx] && sections[_selectedFenceSectionIdx].line) {
    var s = sections[_selectedFenceSectionIdx];
    s.line.setStyle({ color: '#ff6b1a', weight: _deleteMode ? 6 : 4, dashArray: _deleteMode ? '8,4' : (s.closed ? null : '10, 8') });
  }
  _selectedMulchIdx = -1;
  _selectedFenceSectionIdx = -1;
  _selectedGateIdx = -1;
  hideSelectionBar();
}

function showSelectionBar(text, onDelete) {
  var bar = document.getElementById('selection-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'selection-bar';
    bar.className = 'selection-bar';
    document.body.appendChild(bar);
  }
  bar.innerHTML = '<span class="selection-text">' + text + '</span>' +
    '<button class="selection-delete-btn" id="selection-delete-btn">Delete</button>' +
    '<button class="selection-cancel-btn" onclick="deselectAll(); if(_deleteMode) showDeleteModeBar();">Cancel</button>';
  bar.style.display = 'flex';
  document.getElementById('selection-delete-btn').onclick = onDelete;
}

function hideSelectionBar() {
  var bar = document.getElementById('selection-bar');
  if (bar) bar.style.display = 'none';
}

function removeMulchArea(idx) {
  var area = mulchAreas[idx];
  if (!area) return;

  // Save for undo
  undoStack.push({ type: 'deleteMulch', points: area.points.slice(), areaSqFt: area.areaSqFt, perimeterFt: area.perimeterFt });

  area.markers.forEach(function(m) { map.removeLayer(m); });
  if (area.polygon) map.removeLayer(area.polygon);
  if (area.areaLabel) map.removeLayer(area.areaLabel);
  if (area.mulchLeaderLine) map.removeLayer(area.mulchLeaderLine);
  if (area.rotMarker) map.removeLayer(area.rotMarker);
  if (area.rotLine) map.removeLayer(area.rotLine);

  mulchAreas.splice(idx, 1);
  // Rebind drags for remaining areas (indices shifted)
  mulchAreas.forEach(function(a, i) { rebindMulchMarkerDrags(i); });
  renderMulchAreas();
  recalculate();
  markUnsaved();
}

function renderMulchAreas() {
  var list = document.getElementById('mulch-areas-list');
  var summary = document.getElementById('mulch-summary');
  if (!list) return;

  if (mulchAreas.length === 0) {
    list.innerHTML = '<p class="empty-state">Draw areas on the map with the Mulch tool</p>';
    if (summary) summary.style.display = 'none';
    return;
  }

  var mat = MULCH[selectedMulchMaterial];
  var bagPrice = mat ? (customPricing['mulch.' + selectedMulchMaterial + '.bagCost'] || mat.bagCost) : 0;
  var totalSqFt = 0;
  var totalBags = 0;
  var totalCuYd = 0;
  var html = '';

  mulchAreas.forEach(function(area, idx) {
    var cubicFeet = (area.areaSqFt * selectedMulchDepth) / 12;
    var bags = mat ? Math.ceil(cubicFeet / mat.bagCuFt) : 0;
    var cuYd = Math.round(cubicFeet / 27 * 10) / 10;
    var bulkPrice = mat ? (customPricing['mulch.' + selectedMulchMaterial + '.bulkCuYdCost'] || mat.bulkCuYdCost) : 0;
    var cost = selectedMulchDelivery === 'bags' ? bags * bagPrice : cuYd * bulkPrice;
    totalSqFt += area.areaSqFt;
    totalBags += bags;
    totalCuYd += cuYd;

    html += '<div class="bom-row">' +
      '<div class="bom-name">Area ' + (idx + 1) + '</div>' +
      '<div class="bom-fields">' +
        '<label class="bom-field"><span class="bom-field-label">' + (useMetric ? 'm²' : 'Sq ft') + '</span>' +
          '<span style="font-size:0.85rem;padding:4px 0;min-width:50px;text-align:right">' + (useMetric ? Math.round(area.areaSqFt * 0.092903).toLocaleString() : area.areaSqFt.toLocaleString()) + '</span>' +
        '</label>' +
        '<label class="bom-field"><span class="bom-field-label">' + (selectedMulchDelivery === 'bags' ? 'Bags' : (useMetric ? 'm³' : 'Cu yd')) + '</span>' +
          '<span style="font-size:0.85rem;padding:4px 0;min-width:40px;text-align:right">' + (selectedMulchDelivery === 'bags' ? bags : (useMetric ? (cuYd * 0.764555).toFixed(1) : cuYd)) + '</span>' +
        '</label>' +
        '<span class="bom-cost">$' + Math.round(cost).toLocaleString() + '</span>' +
        '<button onclick="removeMulchArea(' + idx + ')" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:14px;padding:0 4px;flex-shrink:0">&times;</button>' +
      '</div>' +
    '</div>';
  });
  list.innerHTML = html;

  // Update summary
  if (summary) {
    summary.style.display = mulchAreas.length > 0 ? 'block' : 'none';
    document.getElementById('mulch-total-sqft').textContent = fmtArea(totalSqFt);
    if (selectedMulchDelivery === 'bags') {
      document.getElementById('mulch-total-qty-label').textContent = 'Total bags';
      document.getElementById('mulch-total-qty').textContent = totalBags.toLocaleString();
    } else {
      document.getElementById('mulch-total-qty-label').textContent = 'Total bulk';
      document.getElementById('mulch-total-qty').textContent = fmtCuYd(totalCuYd);
    }
    document.getElementById('mulch-total-cuyd').textContent = fmtCuYd(Math.round(totalCuYd * 10) / 10);
  }

  // Update map labels
  mulchAreas.forEach(function(area) {
    var maxLat = Math.max.apply(null, area.points.map(function(p) { return p.lat; }));
    var center = getMulchCenter(area.points);
    var newAnchor = { lat: maxLat + 0.00003, lng: center.lng };
    area.areaLabel._anchorLat = newAnchor.lat;
    area.areaLabel._anchorLng = newAnchor.lng;
    var lp = area.areaLabel._dragOffset ? { lat: newAnchor.lat + area.areaLabel._dragOffset.dlat, lng: newAnchor.lng + area.areaLabel._dragOffset.dlng } : newAnchor;
    area.areaLabel.setLatLng(lp);
    area.areaLabel.setIcon(L.divIcon({
      className: 'mulch-area-label',
      html: getMulchLabelHtml(area.areaSqFt, area.points),
      iconSize: [120, 36], iconAnchor: [60, 36]
    }));
    if (area.mulchLeaderLine) {
      area.mulchLeaderLine.setLatLngs([[newAnchor.lat, newAnchor.lng], [lp.lat, lp.lng]]);
      area.mulchLeaderLine.setStyle({ opacity: area.areaLabel._dragOffset ? 0.6 : 0 });
    }
  });
}

function calculateMulchTotal() {
  var total = 0;
  var allItems = [];
  var addFabric = document.getElementById('mulch-fabric') && document.getElementById('mulch-fabric').checked;
  var addEdging = document.getElementById('mulch-edging') && document.getElementById('mulch-edging').checked;

  mulchAreas.forEach(function(area, idx) {
    var bom = calculateMulchBOM(area.areaSqFt, selectedMulchMaterial, selectedMulchDepth, {
      deliveryMode: selectedMulchDelivery,
      addFabric: addFabric,
      addEdging: addEdging,
      perimeterFt: area.perimeterFt,
      customPricing: customPricing
    });
    if (bom) {
      total += bom.materialTotal;
      allItems.push({ areaIdx: idx, bom: bom });
    }
  });

  return { total: total, details: allItems };
}

// Handle double-click to close mulch area
function onMapDblClick(e) {
  if (currentTool === 'mulch' && activeMulchPoints.length >= 3) {
    closeMulchArea();
    L.DomEvent.stopPropagation(e);
    L.DomEvent.preventDefault(e);
  }
}

// === Calculation ===
function toggleFenceEnabled(on) {
  fenceEnabled = on;
  // Show/hide fence map elements
  sections.forEach(function(s) {
    if (s.line) on ? s.line.addTo(map) : map.removeLayer(s.line);
    (s.markers || []).forEach(function(m) { on ? m.addTo(map) : map.removeLayer(m); });
    (s.labels || []).forEach(function(l) { on ? l.addTo(map) : map.removeLayer(l); });
    (s.leaderLines || []).forEach(function(l) { on ? l.addTo(map) : map.removeLayer(l); });
  });
  gates.forEach(function(g) { if (g.marker) on ? g.marker.addTo(map) : map.removeLayer(g.marker); });
  // Show/hide fence-related panel sections
  ['material', 'height', 'extras', 'ground', 'gates'].forEach(function(s) {
    var el = document.querySelector('[data-section="' + s + '"]');
    if (el) el.style.display = on ? '' : 'none';
  });
  var feetEl = document.getElementById('footage-display');
  if (feetEl) feetEl.style.display = on ? '' : 'none';
  var fenceRow = document.getElementById('row-fence');
  if (fenceRow) fenceRow.style.display = on ? '' : 'none';
  recalculate();
}

function toggleMulchEnabled(on) {
  mulchEnabled = on;
  // Show/hide mulch map elements
  mulchAreas.forEach(function(a) {
    if (a.polygon) on ? a.polygon.addTo(map) : map.removeLayer(a.polygon);
    if (a.label) on ? a.label.addTo(map) : map.removeLayer(a.label);
  });
  // Show/hide mulch panel section
  var mulchSection = document.querySelector('[data-section="mulch"]');
  if (mulchSection) mulchSection.style.display = on ? '' : 'none';
  recalculate();
}

function recalculate() {
  const feet = updateFootage();
  // Scale price/ft based on height (6ft is baseline)
  const heightMult = selectedHeight <= 4 ? 0.8 : selectedHeight >= 8 ? 1.3 : (0.8 + (selectedHeight - 4) * 0.125);

  let fenceCost = fenceEnabled ? feet * selectedFence.price * heightMult : 0;
  const gateCost = fenceEnabled ? gates.reduce((sum, g) => sum + g.price, 0) : 0;
  const extrasTotal = fenceEnabled ? calcAllExtras(feet) : 0;

  fenceCost *= terrainMultiplier;
  const mulchResult = calculateMulchTotal();
  const mulchCost = mulchEnabled ? mulchResult.total : 0;
  const customTotal = customItems.reduce((sum, i) => sum + (i.qty * i.unitCost), 0);
  const total = fenceCost + gateCost + extrasTotal + mulchCost + customTotal;

  // Update summary
  var fenceTypeKey = 'fence_' + selectedFence.type.replace('-', '_');
  document.getElementById('sum-type').textContent = t(fenceTypeKey);
  document.getElementById('sum-height').textContent = selectedHeight;
  document.getElementById('sum-fence').textContent = '$' + Math.round(fenceCost).toLocaleString();

  document.getElementById('row-gates').style.display = gates.length > 0 ? 'flex' : 'none';
  document.getElementById('sum-gate-count').textContent = gates.length;
  document.getElementById('sum-gates').textContent = '$' + gateCost.toLocaleString();

  // Render active extras in summary
  var extrasSummaryHtml = '';
  extras.forEach(function(e) {
    var val = fenceEnabled ? calcExtraTotal(e, feet) : 0;
    if (val > 0) {
      extrasSummaryHtml += '<div class="summary-row" style="display:flex"><span>' + escapeHtml(e.name) + '</span><span>$' + Math.round(val).toLocaleString() + '</span></div>';
    }
  });
  var extrasSummaryEl = document.getElementById('extras-summary-rows');
  if (extrasSummaryEl) extrasSummaryEl.innerHTML = extrasSummaryHtml;

  document.getElementById('row-terrain').style.display = terrainMultiplier > 1 ? 'flex' : 'none';
  document.getElementById('sum-terrain').textContent = '+' + Math.round((terrainMultiplier - 1) * 100) + '%';

  document.getElementById('row-mulch').style.display = mulchCost > 0 ? 'flex' : 'none';
  document.getElementById('sum-mulch').textContent = '$' + Math.round(mulchCost).toLocaleString();
  document.getElementById('mulch-total-row').style.display = mulchCost > 0 ? 'flex' : 'none';
  document.getElementById('mulch-total').textContent = '$' + Math.round(mulchCost).toLocaleString();

  document.getElementById('row-custom').style.display = customTotal > 0 ? 'flex' : 'none';
  document.getElementById('sum-custom').textContent = '$' + Math.round(customTotal).toLocaleString();

  document.getElementById('sum-total').textContent = '$' + Math.round(total).toLocaleString();

  // Contractor markup
  var laborPerFt = parseFloat(document.getElementById('markup-labor').value) || 0;
  var markupPct = parseFloat(document.getElementById('markup-percent').value) || 0;
  var laborCost = Math.round(feet * laborPerFt);
  var markupAmt = Math.round(total * markupPct / 100);
  var customerPrice = total + laborCost + markupAmt;
  var profit = laborCost + markupAmt;

  document.getElementById('markup-labor-row').style.display = laborCost > 0 ? 'flex' : 'none';
  document.getElementById('sum-labor').textContent = '$' + laborCost.toLocaleString();
  document.getElementById('markup-markup-row').style.display = markupAmt > 0 ? 'flex' : 'none';
  document.getElementById('sum-markup').textContent = '$' + markupAmt.toLocaleString();
  document.getElementById('sum-customer-price').textContent = '$' + Math.round(customerPrice).toLocaleString();
  document.getElementById('sum-profit').textContent = '$' + profit.toLocaleString();

  // Auto-save to localStorage
  try {
    saveActiveSection();
    localStorage.setItem('fc_autosave', JSON.stringify({
      sections: sections.map(function(s) {
        return {
          points: s.points.map(function(p) { return { lat: p.lat, lng: p.lng }; }),
          closed: s.closed, curveMode: s.curveMode,
          fenceType: s.fenceType, fencePrice: s.fencePrice, fenceHeight: s.fenceHeight,
          notes: s.notes || ''
        };
      }),
      activeSectionIdx: activeSectionIdx,
      gates: gates.map(function(g) { return { lat: g.latlng.lat, lng: g.latlng.lng, type: g.type, price: g.price }; }),
      mulchAreas: mulchAreas.map(function(a) { return { points: a.points, areaSqFt: a.areaSqFt, perimeterFt: a.perimeterFt }; }),
      mulchMaterial: selectedMulchMaterial,
      mulchDepth: selectedMulchDepth,
      mulchDelivery: selectedMulchDelivery,
      terrainMultiplier: terrainMultiplier,
      addons: extras.filter(function(e) { return e.on; }).map(function(e) { return { id: e.id, name: e.name, unit: e.unit, price: e.price }; }),
      customer: {
        name: document.getElementById('cust-name').value,
        phone: document.getElementById('cust-phone').value,
        address: document.getElementById('cust-address').value
      },
      laborPerFt: laborPerFt,
      markupPct: markupPct,
      mapView: [map.getCenter().lat, map.getCenter().lng],
      mapZoom: map.getZoom(),
      savedAt: Date.now()
    }));
  } catch (e) {}

  // BOM — aggregate across all sections + mulch (respecting toggles)
  saveActiveSection();
  var combinedBOM = fenceEnabled ? calculateCombinedBOM() : null;

  // Append mulch BOM items
  if (mulchEnabled && mulchAreas.length > 0 && mulchResult.details.length > 0) {
    if (!combinedBOM) combinedBOM = { items: [], materialTotal: 0 };
    mulchResult.details.forEach(function(d, i) {
      var matName = MULCH[selectedMulchMaterial] ? MULCH[selectedMulchMaterial].name : selectedMulchMaterial;
      combinedBOM.items.push({
        name: 'Mulch Area ' + (d.areaIdx + 1) + ': ' + matName + ' ' + selectedMulchDepth + '″ — ' + mulchAreas[d.areaIdx].areaSqFt.toLocaleString() + ' sq ft',
        qty: 0, unit: '', unitCost: 0, total: 0, isHeader: true
      });
      d.bom.items.forEach(function(item) {
        combinedBOM.items.push(item);
      });
      combinedBOM.materialTotal += d.bom.materialTotal;
    });
  }

  renderBOM(combinedBOM);

  // After BOM renders with overrides, update the estimate total to match
  if (combinedBOM) {
    var bomTotal = combinedBOM.materialTotal;
    var adjTotal = bomTotal + gateCost + removal + permit + stain + customTotal;
    document.getElementById('sum-fence').textContent = '$' + Math.round(fenceEnabled ? (bomTotal - (mulchEnabled ? mulchCost : 0)) : 0).toLocaleString();
    if (mulchEnabled && mulchCost > 0) {
      var mulchBomTotal = combinedBOM.items.filter(function(i) { return !i.isHeader && i.name && i.name.indexOf('Mulch') >= 0; }).reduce(function(s, i) { return s + i.total; }, 0);
      document.getElementById('sum-mulch').textContent = '$' + Math.round(mulchBomTotal).toLocaleString();
      document.getElementById('mulch-total').textContent = '$' + Math.round(mulchBomTotal).toLocaleString();
    }
    document.getElementById('sum-total').textContent = '$' + Math.round(adjTotal).toLocaleString();
    // Update contractor markup with adjusted total
    var adjLaborCost = Math.round(feet * (parseFloat(document.getElementById('markup-labor').value) || 0));
    var adjMarkupAmt = Math.round(adjTotal * (parseFloat(document.getElementById('markup-percent').value) || 0) / 100);
    var adjCustomerPrice = adjTotal + adjLaborCost + adjMarkupAmt;
    document.getElementById('sum-customer-price').textContent = '$' + Math.round(adjCustomerPrice).toLocaleString();
    document.getElementById('sum-profit').textContent = '$' + (adjLaborCost + adjMarkupAmt).toLocaleString();
  }

  // Update mulch area labels (bag counts change with depth/material)
  if (mulchAreas.length > 0) renderMulchAreas();

  // Trigger contextual hints
  if (feet > 0) {
    setTimeout(hintBOMAppears, 600);
    setTimeout(hintAfterEstimate, 1200);
  }
}

// === Address Search ===
function toggleSearch() {
  var bar = document.getElementById('search-bar');
  bar.classList.toggle('collapsed');
  if (!bar.classList.contains('collapsed')) {
    document.getElementById('address-input').focus();
  }
}

var _searchTimer = null;
var _searchDropdown = null;

function searchAddress(selectedDisplay) {
  var input = document.getElementById('address-input');
  var query = selectedDisplay || input.value.trim();
  if (!query) return;
  hideSearchDropdown();

  fetch('https://nominatim.openstreetmap.org/search?format=json&q=' + encodeURIComponent(query) + '&limit=1&countrycodes=us')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.length > 0) {
        var lat = parseFloat(data[0].lat);
        var lon = parseFloat(data[0].lon);
        map.setView([lat, lon], 19);
        document.getElementById('cust-address').value = data[0].display_name;
        input.value = '';
        document.getElementById('search-bar').classList.add('collapsed');
      } else {
        showToast(t('toast_addr_not_found'));
      }
    })
    .catch(function() { showToast(t('toast_search_failed')); });
}

function showSearchSuggestions(query) {
  if (query.length < 3) { hideSearchDropdown(); return; }

  clearTimeout(_searchTimer);
  _searchTimer = setTimeout(function() {
    fetch('https://nominatim.openstreetmap.org/search?format=json&q=' + encodeURIComponent(query) + '&limit=5&countrycodes=us&addressdetails=1')
      .then(function(r) { return r.json(); })
      .then(function(results) {
        if (results.length === 0) { hideSearchDropdown(); return; }

        if (!_searchDropdown) {
          _searchDropdown = document.createElement('div');
          _searchDropdown.id = 'search-dropdown';
          _searchDropdown.style.cssText = 'position:absolute;top:100%;left:0;right:0;background:var(--surface,#fff);border:1px solid var(--border,#d4cdc4);border-top:none;border-radius:0 0 8px 8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);z-index:9999;max-height:200px;overflow-y:auto';
          document.getElementById('search-bar').appendChild(_searchDropdown);
        }

        _searchDropdown.innerHTML = results.map(function(r, i) {
          var parts = r.display_name.split(',');
          var main = parts[0];
          var sub = parts.slice(1, 3).join(',').trim();
          return '<div class="search-suggestion" data-idx="' + i + '" style="padding:8px 12px;cursor:pointer;font-size:0.85rem;border-bottom:1px solid var(--border,#eee);transition:background 0.1s"' +
            ' onmouseover="this.style.background=\'var(--surface-2,#ede8e2)\'"' +
            ' onmouseout="this.style.background=\'none\'"' +
            ' onclick="selectSuggestion(' + r.lat + ',' + r.lon + ',\'' + escapeHtml(r.display_name).replace(/'/g, "\\'") + '\')">' +
            '<div style="font-weight:600;color:var(--text,#2c2417)">' + escapeHtml(main) + '</div>' +
            '<div style="font-size:0.75rem;color:var(--text-muted,#6b6052)">' + escapeHtml(sub) + '</div>' +
          '</div>';
        }).join('');
      })
      .catch(function() {});
  }, 300);
}

function selectSuggestion(lat, lng, displayName) {
  map.setView([lat, lng], 19);
  document.getElementById('cust-address').value = displayName;
  document.getElementById('address-input').value = '';
  document.getElementById('search-bar').classList.add('collapsed');
  hideSearchDropdown();
}

function hideSearchDropdown() {
  if (_searchDropdown) {
    _searchDropdown.remove();
    _searchDropdown = null;
  }
}

document.getElementById('address-input').addEventListener('input', function() {
  showSearchSuggestions(this.value.trim());
});

document.getElementById('address-input').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') { searchAddress(); e.preventDefault(); }
  if (e.key === 'Escape') { hideSearchDropdown(); document.getElementById('search-bar').classList.add('collapsed'); }
});

// Close dropdown when clicking outside
document.addEventListener('click', function(e) {
  if (!e.target.closest('#search-bar')) hideSearchDropdown();
});

// === Share / Approval Workflow ===
// Share interactive map view — for teammates/collaboration
function shareView() {
  try {
  var pts = fencePoints.map(p => [p.lat, p.lng]);
  const data = {
    p: pts.length > 0 ? encodePolyline(pts) : undefined,
    g: gates.map(g => ({ t: g.type, lt: Math.round(g.latlng.lat * 1e6) / 1e6, ln: Math.round(g.latlng.lng * 1e6) / 1e6 })),
    f: selectedFence.type,
    h: selectedHeight,
    t: terrainMultiplier,
    c: fenceClosed ? 1 : 0,
    cv: curveMode ? 1 : 0,
    a: extras.filter(function(e) { return e.on; }).map(function(e) { return { i: e.id, n: e.name, u: e.unit, p: e.price }; }),
    n: document.getElementById('cust-name').value,
    ph: document.getElementById('cust-phone').value,
    ci: customItems.filter(i => i.name && i.unitCost > 0).map(i => ({ nm: i.name, q: i.qty, uc: i.unitCost })),
    ma: mulchAreas.map(function(a) {
      var mpts = a.points.map(function(p) { return [p.lat, p.lng]; });
      return { pl: encodePolyline(mpts), sq: a.areaSqFt, pm: a.perimeterFt };
    }),
    mm: selectedMulchMaterial,
    md: selectedMulchDepth,
    mv: selectedMulchDelivery,
    vw: [Math.round(map.getCenter().lat * 1e6) / 1e6, Math.round(map.getCenter().lng * 1e6) / 1e6],
    vz: map.getZoom(),
    _v: 2
  };

  // Strip empty/default values to shorten the URL
  if (!data.n) delete data.n;
  if (!data.ph) delete data.ph;
  if (!data.p) delete data.p;
  if (data.g.length === 0) delete data.g;
  if (data.ci.length === 0) delete data.ci;
  if (!data.ma || data.ma.length === 0) delete data.ma;
  if (data.t === 1) delete data.t;
  if (data.c === 0) delete data.c;
  if (data.cv === 0) delete data.cv;
  if (data.a && data.a.length === 0) delete data.a;
  if (data.f === 'wood') delete data.f;
  if (data.h === 6) delete data.h;
  if (data.mm === 'hardwood') delete data.mm;
  if (data.md === 3) delete data.md;
  if (data.mv === 'bags') delete data.mv;

  var jsonStr = JSON.stringify(data);
  var encoded;
  try {
    encoded = btoa(unescape(encodeURIComponent(jsonStr)));
  } catch (e) {
    encoded = btoa(jsonStr);
  }
  var url = window.location.origin + window.location.pathname + '?e=' + encoded;
  // If URL is too long, warn user to save first
  if (url.length > 8000) {
    showToast('Estimate is too large to share via link. Save it first, then share.');
    return;
  }

  nativeShareOrDialog('Fence Estimate', url);
  } catch (e) {
    console.error('Share failed:', e);
    showToast('Could not share: ' + e.message);
  }
}

function copyToClipboard(text) {
  // Try modern API first, fall back to textarea hack for HTTP
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(() => {
      showToast(t('toast_link_copied'));
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
  ta.style.userSelect = 'text';
  ta.style.webkitUserSelect = 'text';
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

// Use native share on mobile, custom dialog on desktop
function isMobileDevice() {
  return /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    ('ontouchstart' in window && window.innerWidth < 900);
}

function nativeShareOrDialog(title, url) {
  // Mobile: use native share sheet (Android/iOS)
  if (navigator.share && isMobileDevice()) {
    navigator.share({ title: title, url: url }).catch(function() {
      copyToClipboard(url);
    });
    return;
  }
  // Desktop: show custom share dialog
  showShareDialog(title, url);
}

function showShareDialog(title, url) {
  var existing = document.getElementById('share-dialog-overlay');
  if (existing) existing.remove();

  var customerName = document.getElementById('cust-name').value || 'your fence estimate';

  var overlay = document.createElement('div');
  overlay.id = 'share-dialog-overlay';
  overlay.className = 'modal-overlay';
  overlay.style.display = 'flex';
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };

  overlay.innerHTML =
    '<div class="modal" style="max-width:440px">' +
      '<h3 style="font-size:1.15rem;font-weight:700;margin-bottom:12px">Share Estimate</h3>' +
      '<p style="color:var(--text-muted);font-size:0.85rem;margin-bottom:16px">' + title + '</p>' +
      '<div style="display:flex;gap:8px;margin-bottom:16px">' +
        '<input type="text" value="' + url.replace(/"/g, '&quot;') + '" readonly id="share-url-input" style="flex:1;padding:10px 12px;font-size:0.85rem;border:1.5px solid var(--border);border-radius:var(--radius);background:var(--bg);color:var(--text);font-family:var(--font);overflow:hidden;text-overflow:ellipsis">' +
        '<button class="btn" onclick="document.getElementById(\'share-url-input\').select();copyToClipboard(\'' + url.replace(/'/g, "\\'") + '\');this.textContent=\'Copied!\';setTimeout(()=>this.textContent=\'Copy\',2000)" style="white-space:nowrap;min-width:70px">Copy</button>' +
      '</div>' +
      '<div style="display:flex;gap:10px;justify-content:center;margin-bottom:16px">' +
        '<a href="sms:?body=' + encodeURIComponent(title + '\n' + url) + '" style="display:flex;flex-direction:column;align-items:center;gap:4px;text-decoration:none;color:var(--text);font-size:0.75rem;padding:8px 12px;border-radius:var(--radius);border:1px solid var(--border);min-width:64px">' +
          '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>Text</a>' +
        '<a href="mailto:?subject=' + encodeURIComponent(title) + '&body=' + encodeURIComponent('Please review this estimate:\n\n' + url) + '" style="display:flex;flex-direction:column;align-items:center;gap:4px;text-decoration:none;color:var(--text);font-size:0.75rem;padding:8px 12px;border-radius:var(--radius);border:1px solid var(--border);min-width:64px">' +
          '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><path d="M22 6l-10 7L2 6"/></svg>Email</a>' +
        '<a href="https://wa.me/?text=' + encodeURIComponent(title + '\n' + url) + '" target="_blank" rel="noopener" style="display:flex;flex-direction:column;align-items:center;gap:4px;text-decoration:none;color:var(--text);font-size:0.75rem;padding:8px 12px;border-radius:var(--radius);border:1px solid var(--border);min-width:64px">' +
          '<svg width="22" height="22" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.11.546 4.093 1.502 5.818L0 24l6.335-1.463C8.07 23.48 9.988 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.81 0-3.506-.479-4.97-1.313l-.357-.212-3.693.968.985-3.598-.232-.37C2.734 16.064 2.2 14.089 2.2 12c0-5.41 4.39-9.8 9.8-9.8 5.41 0 9.8 4.39 9.8 9.8 0 5.41-4.39 9.8-9.8 9.8z"/></svg>WhatsApp</a>' +
      '</div>' +
      '<button class="btn btn-full btn-outline" onclick="this.closest(\'.modal-overlay\').remove()" style="margin-top:4px">Close</button>' +
    '</div>';

  document.body.appendChild(overlay);
}

// Send estimate to customer for approval — requires saved estimate
async function shareEstimate() {
  if (typeof requireSubscription === 'function' && !requireSubscription('share estimates')) return;

  if (typeof activeEstimateId === 'undefined' || !activeEstimateId) {
    showToast('Save the estimate first, then send to customer');
    return;
  }

  try {
    showToast('Generating approval link...');
    const result = await API.shareEstimate(activeEstimateId);
    const url = result.link;

    nativeShareOrDialog('Fence Estimate — Review & Approve', url);
    showToast('Approval link sent!');
  } catch (e) {
    showToast('Could not generate approval link: ' + e.message);
  }
}

function loadFromURL() {
  const params = new URLSearchParams(window.location.search);

  // Handle unsubscribe links
  var unsub = params.get('unsubscribe');
  if (unsub) {
    window.history.replaceState({}, '', window.location.pathname);
    showToast('You have been unsubscribed from emails.');
    // If logged in, update the company profile
    if (typeof Auth !== 'undefined' && Auth.isLoggedIn() && typeof API !== 'undefined') {
      API.updateCompany({ emailOptOut: true }).catch(function() {});
    }
    return;
  }

  const encoded = params.get('e');
  if (!encoded) return;

  try {
    var decoded;
    try { decoded = decodeURIComponent(escape(atob(encoded))); } catch (e) { decoded = atob(encoded); }
    const data = JSON.parse(decoded);

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
      if (Array.isArray(data.a) && data.a.length > 0 && typeof data.a[0] === 'object') {
        // New format: [{i, n, u, p}]
        var addonMap = {};
        data.a.forEach(function(a) { addonMap[a.i] = a; });
        extras.forEach(function(e) {
          if (addonMap[e.id]) { e.on = true; e.price = addonMap[e.id].p; e.unit = addonMap[e.id].u; }
        });
        // Add any custom extras from the link that aren't in defaults
        data.a.forEach(function(a) {
          if (!extras.find(function(e) { return e.id === a.i; })) {
            extras.push({ id: a.i, name: a.n, unit: a.u, price: a.p, on: true });
          }
        });
      } else {
        // Legacy format: [removal, permit, stain]
        extras.forEach(function(e) {
          if (e.id === 'removal') e.on = !!data.a[0];
          else if (e.id === 'permit') e.on = !!data.a[1];
          else if (e.id === 'stain') e.on = !!data.a[2];
        });
      }
      renderExtras();
    }

    // Draw fence points (v2: polyline string, v1: array of arrays)
    var fPts = data._v >= 2 && typeof data.p === 'string' ? decodePolyline(data.p) : data.p;
    if (fPts && fPts.length > 0) {
      fPts.forEach(pt => addFencePoint(L.latLng(pt[0], pt[1])));
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
          gate.price = g.t === 'double' ? 550 : g.t === 'sliding' ? 1200 : 350;
        }
      });
      renderGates();
    }

    // Custom items
    if (data.ci && data.ci.length > 0) {
      data.ci.forEach(ci => {
        customItems.push({ id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Date.now() + Math.random(), name: ci.nm, qty: ci.q, unitCost: ci.uc });
      });
      renderCustomItems();
    }

    // Mulch areas (v2: polyline in .pl, v1: arrays in .pts)
    if (data.ma && data.ma.length > 0) {
      if (data.mm) selectedMulchMaterial = data.mm;
      if (data.md) selectedMulchDepth = data.md;
      if (data.mv) selectedMulchDelivery = data.mv;
      data.ma.forEach(function(a, idx) {
        try {
          var rawPts = data._v >= 2 && a.pl ? decodePolyline(a.pl) : a.pts;
          var pts = rawPts.map(function(p) { return { lat: p[0], lng: p[1] }; });
          finalizeMulchArea(pts);
        } catch (err) {
          console.error('Failed to load mulch area ' + idx + ':', err);
        }
      });
    }

    // Fit map to show everything that was loaded
    var allLoadedPts = [];
    if (fPts) fPts.forEach(function(pt) { allLoadedPts.push([pt[0], pt[1]]); });
    if (data.g) data.g.forEach(function(g) { allLoadedPts.push([g.lt, g.ln]); });
    if (data.ma) data.ma.forEach(function(a) {
      var maPts = data._v >= 2 && a.pl ? decodePolyline(a.pl) : a.pts;
      maPts.forEach(function(pt) { allLoadedPts.push([pt[0], pt[1]]); });
    });

    recalculate();

    // Force the map view — retry multiple times to override anything that runs after
    function setSharedView() {
      if (data.vw && data.vz) {
        map.setView(data.vw, data.vz, { animate: false });
      } else if (allLoadedPts.length >= 2) {
        map.fitBounds(L.latLngBounds(allLoadedPts).pad(0.15), { animate: false, maxZoom: 20 });
      } else if (allLoadedPts.length === 1) {
        map.setView(allLoadedPts[0], 19, { animate: false });
      }
    }
    setSharedView();
    setTimeout(setSharedView, 300);
    setTimeout(setSharedView, 1000);
    setTimeout(setSharedView, 2500);

    // Clean URL
    window.history.replaceState({}, '', window.location.pathname);
  } catch (e) {
    console.error('loadFromURL failed:', e);
    showToast('Could not load shared estimate');
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
  // Use tile-based capture — download satellite tiles directly and draw overlays
  return captureMapWithTiles();
}

function captureMapWithTiles() {
  return new Promise(function(resolve) {
    saveActiveSection();

    // Gather all points
    var allPts = [];
    sections.forEach(function(s) { if (s.points) s.points.forEach(function(p) { allPts.push({ lat: p.lat, lng: p.lng }); }); });
    mulchAreas.forEach(function(a) { if (a.points) a.points.forEach(function(p) { allPts.push({ lat: p.lat, lng: p.lng }); }); });
    gates.forEach(function(g) { if (g.latlng) allPts.push({ lat: g.latlng.lat, lng: g.latlng.lng }); });

    if (allPts.length === 0) { resolve(null); return; }

    // Calculate bounds
    var minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    allPts.forEach(function(p) {
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
      if (p.lng < minLng) minLng = p.lng;
      if (p.lng > maxLng) maxLng = p.lng;
    });

    // Add padding
    var padLat = (maxLat - minLat) * 0.3 || 0.0005;
    var padLng = (maxLng - minLng) * 0.3 || 0.0005;
    minLat -= padLat; maxLat += padLat;
    minLng -= padLng; maxLng += padLng;

    // Choose zoom level — higher zoom = sharper image, more tiles
    var zoom = 20;
    for (var z = 21; z >= 16; z--) {
      var tileCountX = lng2tile(maxLng, z) - lng2tile(minLng, z) + 1;
      var tileCountY = lat2tile(minLat, z) - lat2tile(maxLat, z) + 1;
      if (tileCountX * tileCountY <= 25) { zoom = z; break; } // cap at 25 tiles (5x5)
    }

    // Tile math helpers
    function lng2tile(lng, z) { return Math.floor((lng + 180) / 360 * Math.pow(2, z)); }
    function lat2tile(lat, z) { return Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, z)); }
    function tile2lng(x, z) { return x / Math.pow(2, z) * 360 - 180; }
    function tile2lat(y, z) { var n = Math.PI - 2 * Math.PI * y / Math.pow(2, z); return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))); }

    var tileXmin = lng2tile(minLng, zoom);
    var tileXmax = lng2tile(maxLng, zoom);
    var tileYmin = lat2tile(maxLat, zoom);
    var tileYmax = lat2tile(minLat, zoom);

    var tilesW = tileXmax - tileXmin + 1;
    var tilesH = tileYmax - tileYmin + 1;
    var canvasW = tilesW * 256;
    var canvasH = tilesH * 256;

    var canvas = document.createElement('canvas');
    canvas.width = canvasW;
    canvas.height = canvasH;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#e8e0d6';
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Geographic bounds of the tile grid
    var gridWest = tile2lng(tileXmin, zoom);
    var gridEast = tile2lng(tileXmax + 1, zoom);
    var gridNorth = tile2lat(tileYmin, zoom);
    var gridSouth = tile2lat(tileYmax + 1, zoom);

    // Convert lat/lng to pixel on canvas
    function toX(p) { return ((p.lng - gridWest) / (gridEast - gridWest)) * canvasW; }
    function toY(p) {
      // Mercator projection for Y
      function latToY(lat) { return Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)); }
      return ((latToY(gridNorth) - latToY(p.lat)) / (latToY(gridNorth) - latToY(gridSouth))) * canvasH;
    }

    // Load all tiles
    var loaded = 0;
    var totalTiles = tilesW * tilesH;

    function drawOverlays() {
      // Draw mulch areas
      mulchAreas.forEach(function(area, aIdx) {
        ctx.beginPath();
        area.points.forEach(function(p, i) {
          if (i === 0) ctx.moveTo(toX(p), toY(p)); else ctx.lineTo(toX(p), toY(p));
        });
        ctx.closePath();
        ctx.fillStyle = 'rgba(45, 138, 78, 0.3)';
        ctx.fill();
        ctx.strokeStyle = '#2d8a4e';
        ctx.lineWidth = 4;
        ctx.stroke();

        // Label with area number
        var cx = area.points.reduce(function(s, p) { return s + toX(p); }, 0) / area.points.length;
        var cy = area.points.reduce(function(s, p) { return s + toY(p); }, 0) / area.points.length;
        var numLabel = 'Area ' + (aIdx + 1);
        var sqLabel = area.areaSqFt.toLocaleString() + ' sq ft';
        ctx.font = 'bold 18px sans-serif';
        var tw = Math.max(ctx.measureText(numLabel).width, ctx.measureText(sqLabel).width);
        ctx.fillStyle = 'rgba(45, 138, 78, 0.85)';
        ctx.fillRect(cx - tw / 2 - 6, cy - 24, tw + 12, 44);
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(numLabel, cx, cy - 10);
        ctx.font = '16px sans-serif';
        ctx.fillText(sqLabel, cx, cy + 10);
      });

      // Draw fence lines
      sections.forEach(function(sec) {
        if (sec.points.length < 2) return;
        ctx.beginPath();
        sec.points.forEach(function(p, i) {
          if (i === 0) ctx.moveTo(toX(p), toY(p)); else ctx.lineTo(toX(p), toY(p));
        });
        if (sec.closed) ctx.closePath();
        ctx.strokeStyle = '#c0622e';
        ctx.lineWidth = 4;
        ctx.stroke();
        sec.points.forEach(function(p) {
          ctx.beginPath();
          ctx.arc(toX(p), toY(p), 6, 0, Math.PI * 2);
          ctx.fillStyle = '#c0622e'; ctx.fill();
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
        });
      });

      // Draw gates
      gates.forEach(function(g) {
        var x = toX(g.latlng), y = toY(g.latlng);
        ctx.font = 'bold 14px sans-serif';
        var tw = ctx.measureText('GATE').width;
        ctx.fillStyle = '#c0622e';
        ctx.fillRect(x - tw / 2 - 4, y - 10, tw + 8, 20);
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('GATE', x, y);
      });

      resolve({ dataUrl: canvas.toDataURL('image/jpeg', 0.9), width: canvasW, height: canvasH });
    }

    // Load satellite tiles
    for (var ty = tileYmin; ty <= tileYmax; ty++) {
      for (var tx = tileXmin; tx <= tileXmax; tx++) {
        (function(tx, ty) {
          var img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = function() {
            ctx.drawImage(img, (tx - tileXmin) * 256, (ty - tileYmin) * 256, 256, 256);
            loaded++;
            if (loaded >= totalTiles) drawOverlays();
          };
          img.onerror = function() {
            loaded++;
            if (loaded >= totalTiles) drawOverlays();
          };
          var s = (tx + ty) % 4;
          img.src = 'https://mt' + s + '.google.com/vt/lyrs=s&x=' + tx + '&y=' + ty + '&z=' + zoom;
        })(tx, ty);
      }
    }

    // Timeout fallback
    setTimeout(function() { if (loaded < totalTiles) drawOverlays(); }, 5000);
  });
}

function captureMapReal() {
  return new Promise(function(resolve) {
    var mapEl = document.getElementById('map');
    if (!mapEl) { resolve(null); return; }

    // Hide only UI controls — keep fence lines, mulch polygons, markers visible
    var hideEls = document.querySelectorAll('.leaflet-control-container, .map-empty-state, .zoom-indicator, .mulch-area-label, .segment-label, .angle-label, .leaflet-popup-pane, .drone-handle, .mulch-delete-popup');
    hideEls.forEach(function(el) { el.style.visibility = 'hidden'; });

    // Fit map to show all content
    saveActiveSection();
    var allPts = [];
    sections.forEach(function(s) {
      if (s.points) s.points.forEach(function(p) { allPts.push([p.lat, p.lng]); });
    });
    mulchAreas.forEach(function(a) {
      if (a.points) a.points.forEach(function(p) { allPts.push([p.lat, p.lng]); });
    });
    gates.forEach(function(g) {
      if (g.latlng) allPts.push([g.latlng.lat, g.latlng.lng]);
    });

    var origCenter = map.getCenter();
    var origZoom = map.getZoom();
    if (allPts.length >= 2) {
      var bounds = L.latLngBounds(allPts);
      map.fitBounds(bounds.pad(0.3), { animate: false, maxZoom: 20 });
      // Don't zoom out too far — ensure drawn areas are prominent
      if (map.getZoom() < 18) map.setZoom(18, { animate: false });
    } else if (allPts.length === 1) {
      map.setView(allPts[0], 19, { animate: false });
    }

    map.invalidateSize();
    setTimeout(function() {
      // Capture just the satellite tiles
      html2canvas(mapEl, {
        useCORS: true,
        allowTaint: true,
        scale: 2,
        logging: false,
        backgroundColor: '#e8e0d6'
      }).then(function(canvas) {
        // Restore UI and map view
        hideEls.forEach(function(el) { el.style.visibility = ''; });
        map.setView(origCenter, origZoom, { animate: false });
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      }).catch(function() {
        hideEls.forEach(function(el) { el.style.visibility = ''; });
        map.setView(origCenter, origZoom, { animate: false });
        resolve(null);
      });
    }, 2000);
  });
}

function captureMapFallback() {
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

      // Gather all points from all sections + mulch areas for bounds
      saveActiveSection();
      var allMapPoints = [];
      sections.forEach(function(s) {
        s.points.forEach(function(p) { allMapPoints.push(p); });
      });
      mulchAreas.forEach(function(a) {
        a.points.forEach(function(p) { allMapPoints.push({ lat: p.lat, lng: p.lng }); });
      });
      gates.forEach(function(g) { allMapPoints.push(g.latlng); });

      if (allMapPoints.length < 2) {
        resolve(canvas.toDataURL('image/jpeg', 0.9));
        return;
      }

      // Calculate bounds of all points
      var lats = allMapPoints.map(function(p) { return p.lat; });
      var lngs = allMapPoints.map(function(p) { return p.lng; });
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

      // Draw mulch areas
      mulchAreas.forEach(function(area) {
        ctx.beginPath();
        ctx.moveTo(toX(area.points[0].lng), toY(area.points[0].lat));
        for (var i = 1; i < area.points.length; i++) {
          ctx.lineTo(toX(area.points[i].lng), toY(area.points[i].lat));
        }
        ctx.closePath();
        ctx.fillStyle = 'rgba(45, 138, 78, 0.25)';
        ctx.fill();
        ctx.strokeStyle = '#2d8a4e';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Area label
        var cx = area.points.reduce(function(s, p) { return s + toX(p.lng); }, 0) / area.points.length;
        var cy = area.points.reduce(function(s, p) { return s + toY(p.lat); }, 0) / area.points.length;
        ctx.font = 'bold 10px sans-serif';
        var aText = area.areaSqFt.toLocaleString() + ' sq ft';
        var atw = ctx.measureText(aText).width;
        ctx.fillStyle = 'rgba(45, 138, 78, 0.85)';
        ctx.fillRect(cx - atw / 2 - 5, cy - 8, atw + 10, 16);
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(aText, cx, cy);
      });

      // Draw fence lines for ALL sections
      sections.forEach(function(sec) {
        var pts = sec.points;
        if (pts.length < 2) return;

        if (sec.curveMode && pts.length >= 3) {
          var spline = getSplinePoints(pts, sec.closed);
          ctx.beginPath();
          ctx.moveTo(toX(spline[0].lng), toY(spline[0].lat));
          for (var i = 1; i < spline.length; i++) {
            ctx.lineTo(toX(spline[i].lng), toY(spline[i].lat));
          }
          if (sec.closed) ctx.closePath();
          ctx.strokeStyle = '#c0622e';
          ctx.lineWidth = 3;
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.moveTo(toX(pts[0].lng), toY(pts[0].lat));
          for (var i = 1; i < pts.length; i++) {
            ctx.lineTo(toX(pts[i].lng), toY(pts[i].lat));
          }
          if (sec.closed) ctx.closePath();
          ctx.strokeStyle = '#c0622e';
          ctx.lineWidth = 3;
          if (!sec.closed) ctx.setLineDash([8, 8]);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Draw vertices
        pts.forEach(function(p) {
          ctx.beginPath();
          ctx.arc(toX(p.lng), toY(p.lat), 5, 0, Math.PI * 2);
          ctx.fillStyle = '#c0622e';
          ctx.fill();
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 2;
          ctx.stroke();
        });

        // Draw segment labels
        var segPts = sec.closed ? pts.concat([pts[0]]) : pts;
        for (var i = 1; i < segPts.length; i++) {
          var p1 = segPts[i - 1];
          var p2 = segPts[i];
          var mx = (toX(p1.lng) + toX(p2.lng)) / 2;
          var my = (toY(p1.lat) + toY(p2.lat)) / 2;
          var dLat = (p2.lat - p1.lat) * Math.PI / 180;
          var dLng = (p2.lng - p1.lng) * Math.PI / 180;
          var a = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(p1.lat*Math.PI/180)*Math.cos(p2.lat*Math.PI/180)*Math.sin(dLng/2)*Math.sin(dLng/2);
          var segFeet = Math.round(6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)) * 3.28084);

          var text = fmtLen(segFeet);
          ctx.font = 'bold 11px sans-serif';
          var tw = ctx.measureText(text).width;
          ctx.fillStyle = 'rgba(44, 36, 23, 0.85)';
          ctx.fillRect(mx - tw / 2 - 5, my - 8, tw + 10, 16);
          ctx.fillStyle = '#fff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(text, mx, my);
        }
      });

      // Draw gate markers
      gates.forEach(function(g) {
        var x = toX(g.latlng.lng);
        var y = toY(g.latlng.lat);
        ctx.font = 'bold 10px sans-serif';
        var gateLabel = t('gate_marker_label');
        var tw = ctx.measureText(gateLabel).width;
        ctx.fillStyle = '#c0622e';
        ctx.fillRect(x - tw / 2 - 5, y - 10, tw + 10, 18);
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(gateLabel, x, y - 1);
      });

      // Title
      ctx.font = 'bold 13px sans-serif';
      ctx.fillStyle = '#2c2417';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      var mapTitle = '';
      var footage = updateFootage();
      if (footage > 0 && mulchAreas.length > 0) {
        mapTitle = 'Fence & Mulch Layout — ' + footage + ' ' + t('pdf_linear_ft');
      } else if (footage > 0) {
        mapTitle = t('pdf_fence_layout') + ' — ' + footage + ' ' + t('pdf_linear_ft');
      } else if (mulchAreas.length > 0) {
        var totalMulchSqFt = mulchAreas.reduce(function(s,a){return s+a.areaSqFt;},0);
        mapTitle = 'Mulch Layout — ' + totalMulchSqFt.toLocaleString() + ' sq ft';
      }
      if (mapTitle) ctx.fillText(mapTitle, 12, 10);

      resolve(canvas.toDataURL('image/jpeg', 0.9));
    } catch (e) {
      resolve(null);
    }
  });
}

// === PDF Generation ===
async function generatePDF(mode) {
  if (typeof requireSubscription === 'function' && !requireSubscription('download PDF estimates')) return;
  var isCustomerMode = mode === 'customer';
  try {
  showToast(t('toast_generating_pdf'));

  // Capture map screenshot
  var mapImage = null;
  var mapCaptureW = 0, mapCaptureH = 0;
  try {
    var capture = await captureMap();
    if (capture && capture.dataUrl) {
      mapImage = capture.dataUrl;
      mapCaptureW = capture.width;
      mapCaptureH = capture.height;
    } else if (capture && typeof capture === 'string') {
      mapImage = capture; // fallback: plain data URL
    }
  } catch (e) {
    // Continue without map image
  }

  if (!window.jspdf) {
    showToast(t('toast_pdf_lib_error'));
    return;
  }
  var jsPDF = window.jspdf.jsPDF;
  var doc = new jsPDF({ unit: 'pt', format: 'letter' });
  var w = doc.internal.pageSize.getWidth();   // 612
  var pageH = doc.internal.pageSize.getHeight(); // 792

  // ── Colors ──
  var cDark    = [38, 32, 26];
  var cAccent  = [192, 98, 46];
  var cText    = [44, 36, 23];
  var cSecondary = [120, 112, 100];
  var cMuted   = [170, 162, 150];
  var cStripe  = [248, 246, 243];
  var cSurface = [243, 240, 236];
  var cGreen   = [34, 120, 60];
  var cWhite   = [255, 255, 255];

  // ── Layout constants ──
  var margin = 48;
  var col2 = 564;
  var contentW = 516;
  var colItem = 52;
  var colQty = 400;
  var colUnit = 470;
  var colTotal = 560;

  // ── Data ──
  var custName = document.getElementById('cust-name').value || 'Customer';
  var custPhone = document.getElementById('cust-phone').value;
  var custAddr = document.getElementById('cust-address').value;
  var feet = parseInt(document.getElementById('total-feet').textContent.replace(/,/g, '')) || 0;
  var fType = selectedFence.type.charAt(0).toUpperCase() + selectedFence.type.slice(1).replace('-', ' ');
  var today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  var estNum = 'FC-' + Date.now().toString(36).toUpperCase().slice(-6);
  var hasFence = feet > 0;
  var hasMulch = mulchAreas.length > 0;
  var pageNum = 1;

  // Company data
  var co = window._ftCompany || {};
  var companyName = co.name || 'FenceTrace';
  var companyPhone = co.phone || '';
  var companyAddr = co.address || '';

  saveActiveSection();

  // ── BOM calculation ──
  var bom = hasFence ? calculateCombinedBOM() : null;
  var mulchRes = calculateMulchTotal();
  if (mulchRes.details.length > 0) {
    if (!bom) bom = { items: [], materialTotal: 0 };
    mulchRes.details.forEach(function(d) {
      var mn = MULCH[selectedMulchMaterial] ? MULCH[selectedMulchMaterial].name : selectedMulchMaterial;
      bom.items.push({ name: 'Mulch Area ' + (d.areaIdx + 1) + ': ' + mn + ' ' + selectedMulchDepth + '"', isHeader: true, qty: 0, unit: '', unitCost: 0, total: 0 });
      d.bom.items.forEach(function(item) { bom.items.push(item); });
      bom.materialTotal += d.bom.materialTotal;
    });
  }

  // ── Totals (calculated from BOM, not DOM) ──
  var pdfMaterialsTotal = bom ? bom.materialTotal : 0;
  var pdfGateCost = gates.reduce(function(s, g) { return s + g.price; }, 0);
  var pdfExtrasTotal = calcAllExtras(feet);
  var pdfActiveExtras = extras.filter(function(e) { return e.on && calcExtraTotal(e, feet) > 0; });
  var customTotal = customItems.reduce(function(sum, i) { return sum + (i.qty * i.unitCost); }, 0);
  var pdfTotal = pdfMaterialsTotal + pdfGateCost + pdfExtrasTotal + customTotal;

  var laborPerFt = parseFloat(document.getElementById('markup-labor').value) || 0;
  var markupPct = parseFloat(document.getElementById('markup-percent').value) || 0;
  var laborCost = Math.round(feet * laborPerFt);
  var markupAmt = Math.round(pdfTotal * markupPct / 100);
  var customerPrice = pdfTotal + laborCost + markupAmt;
  var displayTotal = (laborCost > 0 || markupAmt > 0) ? customerPrice : pdfTotal;

  var y = 0;

  // ── Helper: page break ──
  function checkPage(need) {
    if (y + need > pageH - 48) {
      addFooter();
      doc.addPage();
      pageNum++;
      y = 48;
    }
  }

  // ── Helper: footer ──
  function addFooter() {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor.apply(doc, cMuted);
    doc.text('Generated by FenceTrace  \u2022  fencetrace.com', margin, pageH - 24);
    doc.text('Estimate #' + estNum + '  \u2022  Page ' + pageNum, col2, pageH - 24, { align: 'right' });
  }

  // ── Helper: section title ──
  function sectionTitle(text) {
    checkPage(30);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor.apply(doc, cAccent);
    doc.text(text.toUpperCase(), margin, y);
    y += 4;
    doc.setDrawColor.apply(doc, cAccent);
    doc.setLineWidth(1.5);
    doc.line(margin, y, margin + 40, y);
    y += 14;
  }

  // ── Helper: label-value row ──
  function labelValue(label, val, opts) {
    doc.setFont('helvetica', (opts && opts.bold) ? 'bold' : 'normal');
    doc.setFontSize(9);
    doc.setTextColor.apply(doc, cSecondary);
    doc.text(label, margin + ((opts && opts.indent) || 0), y);
    doc.setTextColor.apply(doc, (opts && opts.valColor) || cText);
    doc.setFont('helvetica', (opts && opts.bold) ? 'bold' : 'normal');
    doc.text(val, col2, y, { align: 'right' });
    y += 14;
  }

  // ══════════════════════════════════════════
  // 1. HEADER BAR (0-80pt)
  // ══════════════════════════════════════════
  doc.setFillColor.apply(doc, cDark);
  doc.rect(0, 0, w, 80, 'F');

  // Left: company logo (if available)
  var logoOffset = 0;
  if (co.logo) {
    try {
      // Determine image format from data URL
      var logoFormat = 'PNG';
      if (co.logo.indexOf('image/jpeg') >= 0) logoFormat = 'JPEG';
      // Draw logo at left side of header, vertically centered
      var logoMaxH = 40;
      var logoMaxW = 120;
      // Add image and let jsPDF handle sizing; we specify max dimensions
      doc.addImage(co.logo, logoFormat, margin, 20, logoMaxW, logoMaxH, undefined, 'FAST');
      logoOffset = logoMaxW + 10;
    } catch (e) {
      // If logo fails to render, just skip it
      logoOffset = 0;
    }
  }

  // Left: company name
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor.apply(doc, cWhite);
  doc.text(companyName, margin + logoOffset, 34);

  // Left below: company phone + address
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor.apply(doc, cMuted);
  var companyLine = [companyPhone, companyAddr].filter(Boolean).join('  \u2022  ');
  if (companyLine) doc.text(companyLine, margin + logoOffset, 50);

  // Right: ESTIMATE label
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor.apply(doc, cAccent);
  doc.text('ESTIMATE', col2, 28, { align: 'right' });

  // Right: estimate number
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor.apply(doc, cMuted);
  doc.text('#' + estNum, col2, 42, { align: 'right' });

  // Right: date
  doc.text(today, col2, 54, { align: 'right' });

  // Right: validity
  doc.setFontSize(7);
  doc.text('Valid for 30 days', col2, 66, { align: 'right' });

  y = 96;

  // ══════════════════════════════════════════
  // 2. TWO-COLUMN ROW: Customer + Stat boxes
  // ══════════════════════════════════════════

  // Left column: PREPARED FOR
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor.apply(doc, cAccent);
  doc.text('PREPARED FOR', margin, y);
  y += 14;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor.apply(doc, cText);
  doc.text(custName, margin, y);
  y += 14;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor.apply(doc, cSecondary);
  if (custPhone) { doc.text(custPhone, margin, y); y += 12; }
  // Address: wrap to fit within left column (leave room for stat boxes)
  if (custAddr) {
    var addrMaxW = col2 - 120 * 2 - 10 - margin - 10; // left of stat boxes
    var addrLines = doc.splitTextToSize(custAddr, addrMaxW);
    addrLines.forEach(function(line) { doc.text(line, margin, y); y += 11; });
  }

  // Right column: stat boxes
  var boxW = 120;
  var boxH = 48;
  var boxGap = 10;
  var box1X = col2 - boxW * 2 - boxGap;
  var box2X = col2 - boxW;
  var boxY = 96;

  // Box 1: Total Footage or Total Area
  doc.setFillColor.apply(doc, cSurface);
  doc.roundedRect(box1X, boxY, boxW, boxH, 4, 4, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor.apply(doc, cSecondary);
  if (hasFence) {
    doc.text('TOTAL FOOTAGE', box1X + boxW / 2, boxY + 16, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor.apply(doc, cText);
    doc.text(feet.toLocaleString() + ' ft', box1X + boxW / 2, boxY + 38, { align: 'center' });
  } else {
    var totalMulchSqFt = mulchAreas.reduce(function(s, a) { return s + a.areaSqFt; }, 0);
    doc.text('TOTAL AREA', box1X + boxW / 2, boxY + 16, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor.apply(doc, cText);
    doc.text(totalMulchSqFt.toLocaleString() + ' sf', box1X + boxW / 2, boxY + 38, { align: 'center' });
  }

  // Box 2: Estimate total
  doc.setFillColor.apply(doc, cSurface);
  doc.roundedRect(box2X, boxY, boxW, boxH, 4, 4, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor.apply(doc, cSecondary);
  doc.text('ESTIMATE', box2X + boxW / 2, boxY + 16, { align: 'center' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor.apply(doc, cGreen);
  doc.text('$' + Math.round(displayTotal).toLocaleString(), box2X + boxW / 2, boxY + 38, { align: 'center' });

  // Ensure y is past both columns
  y = Math.max(y, boxY + boxH) + 16;

  // (Map image rendered after total box)

  // ══════════════════════════════════════════
  // 3b. SITE NOTES
  // ══════════════════════════════════════════
  saveActiveSection();
  var allNotes = sections.filter(function(s) { return s.notes && s.notes.trim(); });
  if (allNotes.length > 0 && !isCustomerMode) {
    checkPage(60);
    sectionTitle('Site Notes');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor.apply(doc, cText);
    allNotes.forEach(function(s, i) {
      var label = sections.length > 1 ? 'Section ' + (sections.indexOf(s) + 1) + ': ' : '';
      var lines = doc.splitTextToSize(label + s.notes.trim(), contentW);
      checkPage(lines.length * 12 + 8);
      doc.text(lines, margin, y);
      y += lines.length * 12 + 4;
    });
    y += 8;
  }

  // ══════════════════════════════════════════
  // 4. MATERIAL BREAKDOWN TABLE
  // ══════════════════════════════════════════
  if (bom && bom.items.length > 0) {
    sectionTitle('Material Breakdown');

    // Table header bar (dark)
    var thH = 20;
    checkPage(thH + 18);
    doc.setFillColor.apply(doc, cDark);
    doc.rect(margin, y - 2, contentW, thH, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor.apply(doc, cWhite);
    doc.text('ITEM', colItem, y + 11);
    doc.text('QTY', colQty, y + 11, { align: 'right' });
    doc.text('UNIT COST', colUnit, y + 11, { align: 'right' });
    doc.text('TOTAL', colTotal, y + 11, { align: 'right' });
    y += thH + 6;

    var stripe = false;
    bom.items.forEach(function(item) {
      if (item.isHeader) {
        // Category header — keep with at least 1 item (~40pt)
        checkPage(40);
        y += 4;
        doc.setDrawColor.apply(doc, cAccent);
        doc.setLineWidth(0.75);
        doc.line(margin, y - 2, col2, y - 2);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor.apply(doc, cAccent);
        doc.text(item.name, colItem, y + 8);
        y += 16;
        stripe = false;
        return;
      }
      checkPage(18);
      // Alternating stripe
      if (stripe) {
        doc.setFillColor.apply(doc, cStripe);
        doc.rect(margin, y - 5, contentW, 18, 'F');
      }
      stripe = !stripe;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor.apply(doc, cText);
      doc.text(item.name, colItem, y + 6);
      doc.text(item.qty.toString(), colQty, y + 6, { align: 'right' });
      doc.text('$' + item.unitCost.toFixed(2), colUnit, y + 6, { align: 'right' });
      doc.setFont('helvetica', 'bold');
      doc.text('$' + item.total.toLocaleString(), colTotal, y + 6, { align: 'right' });
      y += 18;
    });

    // Materials Total row
    y += 2;
    doc.setFillColor.apply(doc, cSurface);
    doc.rect(margin, y - 4, contentW, 22, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor.apply(doc, cDark);
    doc.text('Materials Total', colItem, y + 10);
    doc.text('$' + bom.materialTotal.toLocaleString(), colTotal, y + 10, { align: 'right' });
    y += 28;

    // Mulch badge summary
    if (hasMulch && mulchRes.details.length > 0) {
      var totalBags = 0;
      var totalCuYd = 0;
      mulchAreas.forEach(function(a) {
        var cf = (a.areaSqFt * selectedMulchDepth) / 12;
        var mat = MULCH[selectedMulchMaterial];
        if (mat) totalBags += Math.ceil(cf / mat.bagCuFt);
        totalCuYd += cf / 27;
      });
      var badgeText = totalBags + ' BAGS TOTAL  (' + (Math.round(totalCuYd * 10) / 10) + ' cu yd)';
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      var badgeW = doc.getTextWidth(badgeText) + 24;
      var badgeH = 22;
      doc.setFillColor.apply(doc, cDark);
      doc.roundedRect(margin, y - 2, badgeW, badgeH, 4, 4, 'F');
      doc.setTextColor.apply(doc, cWhite);
      doc.text(badgeText, margin + 12, y + 12);
      y += badgeH + 10;
    }
    y += 8;
  }

  // ══════════════════════════════════════════
  // 5. CUSTOM ITEMS
  // ══════════════════════════════════════════
  var validCustom = customItems.filter(function(i) { return i.name && i.unitCost > 0; });
  if (validCustom.length > 0) {
    sectionTitle('Additional Items');

    // Table header bar
    var cthH = 20;
    checkPage(cthH + 18);
    doc.setFillColor.apply(doc, cDark);
    doc.rect(margin, y - 2, contentW, cthH, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor.apply(doc, cWhite);
    doc.text('ITEM', colItem, y + 11);
    doc.text('QTY', colQty, y + 11, { align: 'right' });
    doc.text('UNIT COST', colUnit, y + 11, { align: 'right' });
    doc.text('TOTAL', colTotal, y + 11, { align: 'right' });
    y += cthH + 6;

    var cStripeFlag = false;
    validCustom.forEach(function(i) {
      checkPage(18);
      if (cStripeFlag) {
        doc.setFillColor.apply(doc, cStripe);
        doc.rect(margin, y - 5, contentW, 18, 'F');
      }
      cStripeFlag = !cStripeFlag;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor.apply(doc, cText);
      doc.text(i.name, colItem, y + 6);
      doc.text(i.qty.toString(), colQty, y + 6, { align: 'right' });
      doc.text('$' + i.unitCost.toFixed(2), colUnit, y + 6, { align: 'right' });
      doc.setFont('helvetica', 'bold');
      doc.text('$' + Math.round(i.qty * i.unitCost).toLocaleString(), colTotal, y + 6, { align: 'right' });
      y += 18;
    });
    y += 12;
  }

  // ══════════════════════════════════════════
  // 6. ESTIMATE TOTAL BOX
  // ══════════════════════════════════════════
  // Estimate height needed for total box
  var totalBoxLines = 0;
  if (pdfMaterialsTotal > 0) totalBoxLines++;
  if (hasFence && pdfGateCost > 0) totalBoxLines++;
  totalBoxLines += pdfActiveExtras.length;
  if (customTotal > 0) totalBoxLines++;
  if (!isCustomerMode && (laborCost > 0 || markupAmt > 0)) totalBoxLines += 2; // labor + markup lines
  var estBoxH = 44 + totalBoxLines * 14 + 30; // padding + lines + total row
  checkPage(estBoxH);

  // Draw bordered box background
  var boxStartY = y;
  var innerMargin = margin + 16;
  var innerRight = col2 - 16;
  y += 14;

  // Line items
  function totalLine(label, val) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor.apply(doc, cSecondary);
    doc.text(label, innerMargin, y);
    doc.setTextColor.apply(doc, cText);
    doc.text(val, innerRight, y, { align: 'right' });
    y += 14;
  }

  if (isCustomerMode) {
    // Customer mode: clean summary — no cost breakdown, just category totals that add up
    if (pdfMaterialsTotal > 0) {
      var matLabel = (laborCost > 0) ? 'Materials & Installation' : 'Materials';
      var matVal = pdfMaterialsTotal + laborCost;
      totalLine(matLabel, '$' + Math.round(matVal).toLocaleString());
    }
    if (hasFence && pdfGateCost > 0) totalLine('Gates (' + gates.length + ')', '$' + pdfGateCost.toLocaleString());
    pdfActiveExtras.forEach(function(e) { totalLine(e.name, '$' + Math.round(calcExtraTotal(e, feet)).toLocaleString()); });
    if (customTotal > 0) totalLine('Custom items', '$' + Math.round(customTotal).toLocaleString());
    if (markupAmt > 0) totalLine('Service fee', '$' + markupAmt.toLocaleString());
  } else {
    // Contractor mode: full breakdown
    if (pdfMaterialsTotal > 0) totalLine('Materials', '$' + pdfMaterialsTotal.toLocaleString());
    if (hasFence && pdfGateCost > 0) totalLine('Gates (' + gates.length + ')', '$' + pdfGateCost.toLocaleString());
    pdfActiveExtras.forEach(function(e) { totalLine(e.name, '$' + Math.round(calcExtraTotal(e, feet)).toLocaleString()); });
    if (customTotal > 0) totalLine('Custom items', '$' + Math.round(customTotal).toLocaleString());
  }

  // Divider line
  y += 2;
  doc.setDrawColor.apply(doc, cMuted);
  doc.setLineWidth(0.5);
  doc.line(innerMargin, y, innerRight, y);
  y += 12;

  // Labor + markup (contractor mode only)
  if (!isCustomerMode && (laborCost > 0 || markupAmt > 0)) {
    if (laborCost > 0) totalLine('Labor (' + laborPerFt + '/ft)', '$' + laborCost.toLocaleString());
    if (markupAmt > 0) totalLine('Markup (' + markupPct + '%)', '$' + markupAmt.toLocaleString());
    doc.setDrawColor.apply(doc, cDark);
    doc.setLineWidth(1.5);
    doc.line(innerMargin, y, innerRight, y);
    y += 16;
  }

  // TOTAL row
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor.apply(doc, cDark);
  doc.text('TOTAL', innerMargin, y);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor.apply(doc, cGreen);
  doc.text('$' + Math.round(displayTotal).toLocaleString(), innerRight, y + 2, { align: 'right' });
  y += 20;

  // Profit line (contractor mode only)
  if (!isCustomerMode && (laborCost > 0 || markupAmt > 0)) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor.apply(doc, cSecondary);
    doc.text('Profit: $' + (laborCost + markupAmt).toLocaleString(), innerMargin, y);
    y += 12;
  }

  y += 10;
  var boxEndY = y;

  // Draw the 2pt dark border rounded rect
  doc.setDrawColor.apply(doc, cDark);
  doc.setLineWidth(2);
  doc.roundedRect(margin, boxStartY, contentW, boxEndY - boxStartY, 4, 4, 'S');

  y = boxEndY + 12;

  // ══════════════════════════════════════════
  // 7. DISCLAIMER
  // ══════════════════════════════════════════
  checkPage(50);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor.apply(doc, cMuted);
  var disclaimer = 'This estimate is for reference only and is valid for 30 days. FenceTrace and RavenWing LLC are not responsible for material shortages, cost overruns, or construction outcomes. Prices are approximate and may vary by supplier and location. Always verify measurements on-site before purchasing materials.';
  var disclaimerLines = doc.splitTextToSize(disclaimer, contentW);
  doc.text(disclaimerLines, margin, y);
  y += disclaimerLines.length * 9 + 4;

  if (typeof activeEstimatePhotos !== 'undefined' && activeEstimatePhotos.length > 0) {
    doc.text(activeEstimatePhotos.length + ' photo' + (activeEstimatePhotos.length === 1 ? '' : 's') + ' attached (see online version)', margin, y);
    y += 12;
  }

  // ══════════════════════════════════════════
  // 8. MAP IMAGE (last page)
  // ══════════════════════════════════════════
  if (mapImage) {
    addFooter();
    doc.addPage();
    pageNum++;
    y = 48;

    sectionTitle(t('pdf_fence_layout'));

    var imgW = contentW;
    var captureAspect = (mapCaptureW && mapCaptureH) ? (mapCaptureH / mapCaptureW) : 0.55;
    var imgH = contentW * captureAspect;
    var maxH = pageH - y - 60;
    if (imgH > maxH) imgH = maxH;
    doc.setDrawColor.apply(doc, cSecondary);
    doc.setLineWidth(1);
    doc.addImage(mapImage, 'JPEG', margin, y, imgW, imgH);
    doc.rect(margin, y, imgW, imgH);
    y += imgH + 16;
  }

  // ══════════════════════════════════════════
  // 9. FOOTER
  // ══════════════════════════════════════════
  addFooter();

  // Save
  var filename = 'FenceTrace-' + custName.replace(/[^a-zA-Z0-9]/g, '-') + '-' + estNum + '.pdf';
  doc.save(filename);
  showToast(t('toast_pdf_downloaded'));
  } catch (e) {
    showToast(t('toast_pdf_error', {msg: e.message}));
    console.error('PDF generation failed:', e);
  }
}

// === Reset ===
function resetEstimate() {
  clearAll();
  document.getElementById('cust-name').value = '';
  document.getElementById('cust-phone').value = '';
  document.getElementById('cust-address').value = '';
  extras.forEach(function(e) { e.on = false; });
  renderExtras();

  document.querySelectorAll('.fence-type-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('.fence-type-btn').classList.add('active');
  selectedFence = { type: 'wood', price: 25 };

  document.querySelectorAll('.height-btn').forEach(b => b.classList.remove('active'));
  selectedHeight = 6;
  terrainMultiplier = 1.0;

  // Reset markup
  document.getElementById('markup-labor').value = 0;
  document.getElementById('markup-percent').value = 0;

  // Reset BOM overrides
  bomQtyOverrides = {};
  bomPriceOverrides = {};

  // Reset custom items
  customItems = [];
  if (typeof renderCustomItems === 'function') renderCustomItems();

  recalculate();

  // Force zero display after recalculate (BOM returns 1 post at 0 feet)
  document.getElementById('sum-total').textContent = '$0';
  document.getElementById('sum-fence').textContent = '$0';
  document.getElementById('bom-total').textContent = '$0';
  document.getElementById('sum-customer-price').textContent = '$0';
  document.getElementById('sum-profit').textContent = '$0';
  document.getElementById('sum-labor').textContent = '$0';
  document.getElementById('sum-markup').textContent = '$0';
  var bomList = document.getElementById('bom-list');
  if (bomList) bomList.innerHTML = '<p class="empty-state">' + t('bom_empty') + '</p>';

  clearUnsaved();
  localStorage.removeItem('fc_autosave');
  nextEstimateNumber();
  updateEmptyMapState();

  // Clear photos state
  if (typeof activeEstimateId !== 'undefined') {
    activeEstimateId = null;
    activeEstimatePhotos = [];
    renderPhotoGrid();
  }
}

// === Panel Toggle (mobile) ===
function togglePanel() {
  const panel = document.getElementById('estimate-panel');
  panel.classList.toggle('collapsed');
  // Let the map resize after the panel animates
  setTimeout(() => map.invalidateSize(), 350);
}

// === Demo Data (for screenshots) ===
// Run loadDemo() from browser console, or loadDemo(2) for chain link, loadDemo(3) for multi-section
function loadDemo(scenario) {
  resetEstimate();
  scenario = scenario || 1;

  if (scenario === 1) {
    // Nice suburban wood privacy fence — backyard in Mechanicsville VA
    document.getElementById('cust-name').value = 'Johnson Family';
    document.getElementById('cust-phone').value = '(804) 555-0142';
    document.getElementById('cust-address').value = '8412 Oakwood Dr, Mechanicsville, VA 23116';

    map.setView([37.6235, -77.3465], 19);

    setTimeout(function() {
      // Select wood 6ft
      var woodBtn = document.querySelector('.fence-type-btn');
      if (woodBtn) { selectFence(woodBtn, 'wood'); }

      // Draw a backyard fence
      var points = [
        L.latLng(37.62365, -77.34680),
        L.latLng(37.62365, -77.34620),
        L.latLng(37.62335, -77.34620),
        L.latLng(37.62335, -77.34680)
      ];
      points.forEach(function(p) { addFencePoint(p); });
      closeFence();

      // Add a gate
      setTool('gate');
      addGate(L.latLng(37.62365, -77.34650));
      setTool('draw');

      // Check addons
      var stainExtra = extras.find(function(e) { return e.id === 'stain'; });
      if (stainExtra) stainExtra.on = true;
      renderExtras();

      recalculate();
      showToast('Demo loaded: Wood privacy fence — Johnson backyard');
    }, 1000);
  }

  else if (scenario === 2) {
    // Commercial chain link fence
    document.getElementById('cust-name').value = 'Metro Storage Solutions';
    document.getElementById('cust-phone').value = '(804) 555-0388';
    document.getElementById('cust-address').value = '2200 Mechanicsville Tpke, Richmond, VA 23223';

    map.setView([37.5485, -77.4095], 18);

    setTimeout(function() {
      // Select chain link 6ft
      var btns = document.querySelectorAll('.fence-type-btn');
      btns.forEach(function(b) {
        if (b.textContent.indexOf('Chain') >= 0) selectFence(b, 'chain-link');
      });
      // Select 8ft
      document.querySelectorAll('.height-btn').forEach(function(b) {
        if (b.textContent.trim() === '8 ft') selectHeight(b, 8);
      });

      var points = [
        L.latLng(37.5488, -77.4100),
        L.latLng(37.5488, -77.4085),
        L.latLng(37.5482, -77.4085),
        L.latLng(37.5482, -77.4100)
      ];
      points.forEach(function(p) { addFencePoint(p); });
      closeFence();

      // Two gates
      setTool('gate');
      addGate(L.latLng(37.5488, -77.4092));
      addGate(L.latLng(37.5482, -77.4092));
      setTool('draw');

      recalculate();
      showToast('Demo loaded: Commercial chain link — Metro Storage');
    }, 1000);
  }

  else if (scenario === 3) {
    // Multi-section: wood privacy + aluminum decorative front
    document.getElementById('cust-name').value = 'Williams Residence';
    document.getElementById('cust-phone').value = '(804) 555-0276';
    document.getElementById('cust-address').value = '1510 River Rd, Mechanicsville, VA 23111';

    map.setView([37.6180, -77.3550], 19);

    setTimeout(function() {
      // Section 1: Wood backyard
      var woodBtn = document.querySelector('.fence-type-btn');
      if (woodBtn) selectFence(woodBtn, 'wood');

      var backyard = [
        L.latLng(37.6182, -77.3554),
        L.latLng(37.6182, -77.3546),
        L.latLng(37.6178, -77.3546)
      ];
      backyard.forEach(function(p) { addFencePoint(p); });

      // Gate in the backyard
      setTool('gate');
      addGate(L.latLng(37.6182, -77.3550));
      setTool('draw');

      // Section 2: Aluminum front
      addNewSection();
      var alumBtns = document.querySelectorAll('.fence-type-btn');
      alumBtns.forEach(function(b) {
        if (b.textContent.indexOf('Aluminum') >= 0) selectFence(b, 'aluminum');
      });
      // Select 4ft
      document.querySelectorAll('.height-btn').forEach(function(b) {
        if (b.textContent.trim() === '4 ft') selectHeight(b, 4);
      });

      var front = [
        L.latLng(37.6183, -77.3554),
        L.latLng(37.6183, -77.3546)
      ];
      front.forEach(function(p) { addFencePoint(p); });

      var permitExtra = extras.find(function(e) { return e.id === 'permit'; });
      if (permitExtra) permitExtra.on = true;
      renderExtras();

      recalculate();
      showToast('Demo loaded: Multi-section — Wood backyard + Aluminum front');
    }, 1000);
  }
}

// === Keyboard Shortcuts ===
document.addEventListener('keydown', function(e) {
  // Escape: close modals, drawers, overflow menu
  if (e.key === 'Escape') {
    var modal = document.querySelector('.modal-overlay[style*="flex"]');
    if (modal) { modal.style.display = 'none'; return; }
    var drawer = document.querySelector('.drawer-overlay');
    if (drawer) { drawer.click(); return; }
    var overflow = document.querySelector('.nav-overflow.open');
    if (overflow) { overflow.classList.remove('open'); return; }
  }
  // Delete/Backspace: remove last fence point (when not in an input)
  if ((e.key === 'Delete' || e.key === 'Backspace') && !e.target.closest('input, textarea, select, [contenteditable]')) {
    if (typeof fencePoints !== 'undefined' && fencePoints.length > 0) {
      e.preventDefault();
      if (typeof undoLastPoint === 'function') undoLastPoint();
    }
  }
  // Ctrl+Z: undo last fence point
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey && !e.target.closest('input, textarea, select')) {
    e.preventDefault();
    if (typeof undoLastPoint === 'function') undoLastPoint();
  }
  // Screenshot Prevention
  if (e.key === 'PrintScreen') {
    e.preventDefault();
    showToast(t('toast_screenshot_disabled'));
  }
  // Ctrl+Shift+S (Windows Snip), Cmd+Shift+3/4/5 (Mac)
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 's' || e.key === 'S' || e.key === '3' || e.key === '4' || e.key === '5')) {
    e.preventDefault();
    showToast(t('toast_screenshot_disabled'));
  }
  // Ctrl+P (Print)
  if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
    e.preventDefault();
    showToast(t('toast_print_disabled'));
  }
});

// Block right-click context menu
document.addEventListener('contextmenu', function(e) {
  e.preventDefault();
});

// Pause hint timers and cancel pending RAF when tab is hidden
document.addEventListener('visibilitychange', function() {
  if (document.hidden) {
    // Cancel any pending drag-debounce frame
    if (_dragRecalcRAF) {
      cancelAnimationFrame(_dragRecalcRAF);
      _dragRecalcRAF = 0;
    }
    // Cancel hint auto-dismiss timer
    if (hintAutoTimer) {
      clearTimeout(hintAutoTimer);
      hintAutoTimer = null;
    }
  }
});

// === Contextual Hints System ===
var fcHintsSeen = JSON.parse(localStorage.getItem('fc_hints_seen') || '{}');
var activeHint = null;
var hintAutoTimer = null;

function isHintSeen(id) {
  return !!fcHintsSeen[id];
}

function markHintSeen(id) {
  fcHintsSeen[id] = true;
  localStorage.setItem('fc_hints_seen', JSON.stringify(fcHintsSeen));
}

function dismissHint() {
  if (!activeHint) return;
  var el = document.getElementById('fc-hint-el');
  if (el) {
    el.classList.remove('visible');
    setTimeout(function() { el.remove(); }, 300);
  }
  if (activeHint) markHintSeen(activeHint);
  activeHint = null;
  clearTimeout(hintAutoTimer);
}

function showHint(id, text, anchorEl, position) {
  if (isHintSeen(id)) return;
  if (activeHint) dismissHint();

  activeHint = id;

  var hint = document.createElement('div');
  hint.id = 'fc-hint-el';
  hint.className = 'fc-hint';

  var arrowClass = 'fc-hint-arrow-down'; // default
  if (position === 'below') arrowClass = 'fc-hint-arrow-up';
  else if (position === 'right') arrowClass = 'fc-hint-arrow-left';
  else if (position === 'left') arrowClass = 'fc-hint-arrow-right';

  hint.innerHTML = '<div class="fc-hint-arrow ' + arrowClass + '"></div>' +
    '<div>' + text + '</div>' +
    '<button class="fc-hint-dismiss" onclick="dismissHint()">' + t('hint_got_it') + '</button>';

  document.body.appendChild(hint);

  // Position relative to anchor
  if (anchorEl) {
    var rect = anchorEl.getBoundingClientRect();
    var hintRect;

    // Make visible first to measure, but hidden
    hint.style.visibility = 'hidden';
    hint.style.opacity = '0';
    hint.style.display = 'block';
    hintRect = hint.getBoundingClientRect();

    if (position === 'below') {
      hint.style.top = (rect.bottom + 10) + 'px';
      hint.style.left = Math.max(8, Math.min(window.innerWidth - hintRect.width - 8, rect.left + rect.width / 2 - hintRect.width / 2)) + 'px';
    } else if (position === 'right') {
      hint.style.top = (rect.top + rect.height / 2 - hintRect.height / 2) + 'px';
      hint.style.left = (rect.right + 10) + 'px';
    } else if (position === 'left') {
      hint.style.top = (rect.top + rect.height / 2 - hintRect.height / 2) + 'px';
      hint.style.left = (rect.left - hintRect.width - 10) + 'px';
    } else {
      // above (default)
      hint.style.top = (rect.top - hintRect.height - 10) + 'px';
      hint.style.left = Math.max(8, Math.min(window.innerWidth - hintRect.width - 8, rect.left + rect.width / 2 - hintRect.width / 2)) + 'px';
    }

    hint.style.visibility = '';
  }

  requestAnimationFrame(function() { hint.classList.add('visible'); });

  // Auto-dismiss after 8 seconds
  hintAutoTimer = setTimeout(function() {
    dismissHint();
  }, 8000);
}

// Click anywhere to dismiss hint
document.addEventListener('click', function(e) {
  if (activeHint && !e.target.closest('.fc-hint')) {
    dismissHint();
  }
}, true);

function showQuickStart() {
  if (localStorage.getItem('fc_quickstart_seen')) return;

  setTimeout(function() {
    var el = document.createElement('div');
    el.id = 'quickstart-tips';
    el.innerHTML =
      '<div class="qs-backdrop" onclick="dismissQuickStart()"></div>' +
      '<div class="qs-card">' +
        '<div class="qs-header">Quick Tips</div>' +
        '<div class="qs-tips">' +
          '<div class="qs-tip"><span class="qs-icon">&#9998;</span><b>Draw</b> — tap the map to place fence points</div>' +
          '<div class="qs-tip"><span class="qs-icon">&#9638;</span><b>Gate</b> — tap to place gates on your fence</div>' +
          '<div class="qs-tip"><span class="qs-icon">&#9676;</span><b>Mulch</b> — click &amp; drag to draw mulch beds</div>' +
          '<div class="qs-tip"><span class="qs-icon">&#8635;</span><b>Undo</b> — remove the last point or area</div>' +
          '<div class="qs-tip"><span class="qs-icon">&#10697;</span><b>Close</b> — connect the fence back to the start</div>' +
        '</div>' +
        '<div class="qs-keys">' +
          '<span>D</span> Draw &nbsp; <span>G</span> Gate &nbsp; <span>A</span> Mulch &nbsp; <span>C</span> Curve &nbsp; <span>N</span> New section' +
        '</div>' +
        '<button class="qs-dismiss" onclick="dismissQuickStart()">Got it</button>' +
      '</div>';
    document.body.appendChild(el);
    requestAnimationFrame(function() { el.classList.add('visible'); });
  }, 2000);
}

function dismissQuickStart() {
  localStorage.setItem('fc_quickstart_seen', '1');
  var el = document.getElementById('quickstart-tips');
  if (el) {
    el.classList.remove('visible');
    setTimeout(function() { el.remove(); }, 300);
  }
}

function resetHints() {
  fcHintsSeen = {};
  localStorage.removeItem('fc_hints_seen');
  localStorage.removeItem('fc_quickstart_seen');
  showToast(t('toast_tips_reset'));
}

function resetOnboarding() {
  localStorage.removeItem('fc_onboarded');
  resetHints();
  showToast(t('toast_onboarding_reset'));
}

// Hint triggers — called from various places
function hintFirstVisit() {
  setTimeout(function() {
    var searchBar = document.querySelector('.search-bar');
    if (searchBar) showHint('first_visit', t('hint_first_visit'), searchBar, 'below');
  }, 1500);
}

function hintAfterFirstPoint() {
  if (fencePoints.length === 1) {
    var toolbar = document.querySelector('.map-toolbar');
    if (toolbar) showHint('first_point', t('hint_first_point'), toolbar, 'above');
  }
}

function hintAfterThreePoints() {
  if (fencePoints.length === 3 && !fenceClosed) {
    var closeBtn = document.getElementById('close-btn');
    if (closeBtn) showHint('three_points', t('hint_three_points'), closeBtn, 'above');
  }
}

function hintAfterGate() {
  if (gates.length === 1) {
    var gatesList = document.getElementById('gates-list');
    if (gatesList) showHint('first_gate', t('hint_first_gate'), gatesList, 'above');
  }
}

function hintFenceType() {
  var pencilBtn = document.querySelector('.bom-toggle');
  if (pencilBtn) showHint('fence_type', t('hint_fence_type'), pencilBtn, 'left');
}

function hintAfter50Feet() {
  var feet = parseInt((document.getElementById('total-feet').textContent || '0').replace(/,/g, '')) || 0;
  if (feet >= 50) {
    var firstLabel = document.querySelector('.seg-label');
    if (firstLabel) showHint('fifty_feet', t('hint_fifty_feet'), firstLabel, 'above');
  }
}

function hintBOMAppears() {
  var bomList = document.getElementById('bom-list');
  if (bomList && !bomList.querySelector('.empty-state')) {
    showHint('bom_appears', t('hint_bom_appears'), bomList, 'above');
  }
}

function hintAfterEstimate() {
  var total = document.getElementById('sum-total');
  var val = total ? total.textContent : '$0';
  if (val !== '$0') {
    var actions = document.querySelector('.panel-actions');
    if (actions) showHint('first_estimate', t('hint_first_estimate'), actions, 'above');
    // Show export hint after a delay
    setTimeout(function() {
      var exportBtn = document.querySelector('.bom-toggle[title="Export materials"]') || document.querySelector('.bom-toggle[onclick*="toggleExportMenu"]');
      if (exportBtn) showHint('export_materials', 'Send your material list to a supplier — CSV, clipboard, or email', exportBtn, 'left');
    }, 10000);
  }
}

// === Unsaved Changes Indicator ===
var hasUnsavedChanges = false;

// Warn before leaving with unsaved work
window.addEventListener('beforeunload', function(e) {
  if (hasUnsavedChanges && (fencePoints.length > 0 || mulchAreas.length > 0)) {
    e.preventDefault();
    e.returnValue = '';
  }
});

function markUnsaved() {
  if (hasUnsavedChanges) return;
  hasUnsavedChanges = true;
  var saveBtn = document.getElementById('btn-save');
  if (saveBtn && !saveBtn.querySelector('.save-dot')) {
    var dot = document.createElement('span');
    dot.className = 'save-dot';
    saveBtn.appendChild(dot);
  }
}

function clearUnsaved() {
  hasUnsavedChanges = false;
  var dot = document.querySelector('.save-dot');
  if (dot) dot.remove();
}

// === Estimate Counter ===
var estimateCounter = parseInt(localStorage.getItem('fc_estimate_counter') || '0');

function nextEstimateNumber() {
  estimateCounter++;
  localStorage.setItem('fc_estimate_counter', estimateCounter.toString());
  updateEstimateCounterDisplay();
  return estimateCounter;
}

function updateEstimateCounterDisplay() {
  var el = document.getElementById('estimate-number');
  if (el) el.textContent = 'Estimate #' + estimateCounter;
}

// === Keyboard Shortcuts ===
document.addEventListener('keydown', function(e) {
  // Skip if inside an input, textarea, or select
  var tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

  // Skip if a modal is open
  var authModal = document.getElementById('auth-modal');
  var pricingModal = document.getElementById('pricing-modal');
  var accountModal = document.getElementById('account-modal');
  if ((authModal && authModal.style.display === 'flex') ||
      (pricingModal && pricingModal.style.display === 'flex') ||
      (accountModal && accountModal.style.display === 'flex')) {
    // Only handle Escape in modals
    if (e.key === 'Escape') {
      if (pricingModal && pricingModal.style.display === 'flex') { closePricingEditor(); e.preventDefault(); return; }
      if (accountModal && accountModal.style.display === 'flex') { hideAccountPanel(); e.preventDefault(); return; }
      if (authModal && authModal.style.display === 'flex' && document.getElementById('auth-close').style.display === 'block') { hideAuthUI(); e.preventDefault(); return; }
    }
    return;
  }

  // Ctrl+Z: Undo
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
    e.preventDefault();
    undoLast();
    return;
  }

  // Ctrl+C: Copy last mulch area (when in mulch mode)
  if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C') && currentTool === 'mulch') {
    e.preventDefault();
    if (mulchAreas.length > 0) {
      var last = mulchAreas[mulchAreas.length - 1];
      window._mulchClipboard = last.points.map(function(p) { return { lat: p.lat, lng: p.lng }; });
      showToast('Mulch area copied');
    }
    return;
  }

  // Ctrl+V: Paste mulch area (when in mulch mode)
  if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V') && currentTool === 'mulch') {
    e.preventDefault();
    if (window._mulchClipboard && window._mulchClipboard.length >= 3) {
      // Offset the paste slightly so it doesn't sit right on top
      var offset = 0.0001; // ~11 meters
      var pasted = window._mulchClipboard.map(function(p) {
        return { lat: p.lat + offset, lng: p.lng + offset };
      });
      finalizeMulchArea(pasted);
      showToast('Mulch area pasted');
    } else {
      showToast('Nothing to paste — copy a mulch area first (Ctrl+C)');
    }
    return;
  }

  // Ctrl+Shift+Z or Ctrl+Y: Redo
  if ((e.ctrlKey || e.metaKey) && (e.shiftKey && (e.key === 'z' || e.key === 'Z') || e.key === 'y' || e.key === 'Y')) {
    e.preventDefault();
    redoLast();
    return;
  }

  // X: Delete mode
  if (e.key === 'x' || e.key === 'X') {
    e.preventDefault();
    toggleDeleteMode();
    return;
  }

  // D: Draw tool
  if (e.key === 'd' || e.key === 'D') {
    e.preventDefault();
    setTool('draw');
    return;
  }

  // G: Gate tool
  if (e.key === 'g' || e.key === 'G') {
    e.preventDefault();
    setTool('gate');
    return;
  }

  // A: Mulch tool
  if (e.key === 'a' || e.key === 'A') {
    e.preventDefault();
    setTool('mulch');
    return;
  }

  // C: Toggle curve
  if (e.key === 'c' || e.key === 'C') {
    e.preventDefault();
    toggleCurve();
    return;
  }

  // N: New section
  if (e.key === 'n' || e.key === 'N') {
    e.preventDefault();
    addNewSection();
    return;
  }

  // L: Close/loop fence
  if (e.key === 'l' || e.key === 'L') {
    e.preventDefault();
    if (fenceClosed) { openFence(); } else { closeFence(); }
    return;
  }

  // P: Save as PDF
  if (e.key === 'p' || e.key === 'P') {
    e.preventDefault();
    generatePDF();
    return;
  }

  // E: Share estimate
  if (e.key === 'e' || e.key === 'E') {
    e.preventDefault();
    shareEstimate();
    return;
  }

  // S: Save estimate
  if (e.key === 's' || e.key === 'S') {
    if (typeof Auth !== 'undefined' && Auth.isLoggedIn()) {
      e.preventDefault();
      saveEstimate();
    }
    return;
  }

  // M: My Estimates
  if (e.key === 'm' || e.key === 'M') {
    e.preventDefault();
    if (typeof showEstimatesList === 'function') showEstimatesList();
    return;
  }

  // R: Reset/New estimate
  if (e.key === 'r' || e.key === 'R') {
    e.preventDefault();
    resetEstimate();
    return;
  }

  // Escape: Cancel / close
  if (e.key === 'Escape') {
    dismissHint();
    setTool('draw');
    // Close drawers
    var drawer = document.getElementById('estimates-drawer');
    if (drawer && drawer.style.display !== 'none') {
      hideEstimatesList();
    }
    return;
  }
});

// === Double-click to Finish Drawing ===
function initDoubleClick() {
  map.on('dblclick', function(e) {
    // Prevent default zoom
    L.DomEvent.stopPropagation(e);
    L.DomEvent.preventDefault(e);

    if (currentTool === 'draw' && !fenceClosed) {
      if (fencePoints.length >= 3) {
        closeFence();
      }
      // If fewer than 3 points, just stop (do nothing extra)
    } else if (currentTool === 'mulch' && activeMulchPoints.length >= 3) {
      closeMulchArea();
    }
  });

  // Disable default double-click zoom
  map.doubleClickZoom.disable();
}

// === Empty Map State ===
function updateEmptyMapState() {
  var existing = document.getElementById('map-empty-state');
  if (fencePoints.length > 0 || mulchAreas.length > 0 || activeMulchPoints.length > 0 || currentTool === 'mulch') {
    if (existing) existing.remove();
    return;
  }
  if (existing) return; // Already showing

  var mapEl = document.getElementById('map');
  var overlay = document.createElement('div');
  overlay.id = 'map-empty-state';
  overlay.className = 'map-empty-state';
  overlay.innerHTML = '<div class="map-empty-state-text">' + t('empty_map') + '</div>' +
    '<div class="map-empty-arrow"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12l7 7 7-7"/></svg></div>';
  mapEl.parentElement.appendChild(overlay);
}

// === Init ===
initMap();
renderExtras();
initDoubleClick();
initSections();

// Set initial unit toggle button
var unitBtn = document.getElementById('unit-toggle');
if (unitBtn) unitBtn.textContent = useMetric ? 'm' : 'ft';

// Set initial mulch price fields
var initMat = MULCH[selectedMulchMaterial];
if (initMat && document.getElementById('mulch-bag-price')) {
  document.getElementById('mulch-bag-price').value = (customPricing['mulch.' + selectedMulchMaterial + '.bagCost'] || initMat.bagCost).toFixed(2);
}
if (initMat && document.getElementById('mulch-bulk-price')) {
  document.getElementById('mulch-bulk-price').value = (customPricing['mulch.' + selectedMulchMaterial + '.bulkCuYdCost'] || initMat.bulkCuYdCost).toFixed(2);
}

recalculate();
var _hadSharedURL = window.location.search.indexOf('e=') >= 0;
loadFromURL();
updateEmptyMapState();

// Collapse estimate panel on mobile to show more map
if (window.innerWidth < 768) {
  var panel = document.getElementById('estimate-panel');
  if (panel && !panel.classList.contains('collapsed')) {
    panel.classList.add('collapsed');
    setTimeout(function() { map.invalidateSize(); }, 350);
  }
}

// Increment estimate counter for a fresh session
if (fencePoints.length === 0) {
  nextEstimateNumber();
}
updateEstimateCounterDisplay();

// Auto-restore unsaved work (skip if shared URL was loaded)
if (fencePoints.length === 0 && mulchAreas.length === 0 && !_hadSharedURL) {
  try {
    var autosave = JSON.parse(localStorage.getItem('fc_autosave'));
    if (!autosave) throw 'no autosave';

    var hasContent = (autosave.sections && autosave.sections.some(function(s) { return s.points && s.points.length > 0; }))
      || (autosave.fencePoints && autosave.fencePoints.length > 0)
      || (autosave.mulchAreas && autosave.mulchAreas.length > 0);

    if (hasContent) {
      var prices = { wood: 25, vinyl: 35, 'chain-link': 15, aluminum: 40, iron: 55 };

      // Restore sections (new format) or single fence (old format)
      if (autosave.sections && autosave.sections.length > 0) {
        // Load first section into default
        var s0 = autosave.sections[0];
        if (s0.fenceType) selectedFence = { type: s0.fenceType, price: prices[s0.fenceType] || 25 };
        if (s0.fenceHeight) selectedHeight = s0.fenceHeight;
        if (s0.points) s0.points.forEach(function(pt) { addFencePoint(L.latLng(pt.lat, pt.lng)); });
        if (s0.closed) closeFence();
        if (s0.curveMode) { curveMode = true; var cb = document.getElementById('curve-btn'); if (cb) cb.classList.add('active'); }

        // Additional sections
        for (var si = 1; si < autosave.sections.length; si++) {
          var sec = autosave.sections[si];
          addNewSection();
          if (sec.fenceType) { selectedFence = { type: sec.fenceType, price: prices[sec.fenceType] || 25 }; sections[activeSectionIdx].fenceType = sec.fenceType; }
          if (sec.fenceHeight) { selectedHeight = sec.fenceHeight; sections[activeSectionIdx].fenceHeight = sec.fenceHeight; }
          if (sec.points) sec.points.forEach(function(pt) { addFencePoint(L.latLng(pt.lat, pt.lng)); });
          if (sec.closed) closeFence();
        }
      } else if (autosave.fencePoints && autosave.fencePoints.length > 0) {
        // Old format fallback
        if (autosave.fenceType) selectedFence = { type: autosave.fenceType, price: prices[autosave.fenceType] || 25 };
        if (autosave.fenceHeight) selectedHeight = autosave.fenceHeight;
        autosave.fencePoints.forEach(function(pt) { addFencePoint(L.latLng(pt.lat, pt.lng)); });
        if (autosave.fenceClosed) closeFence();
      }

      // Restore terrain
      if (autosave.terrainMultiplier) terrainMultiplier = autosave.terrainMultiplier;

      // Restore addons
      if (autosave.addons) {
        if (Array.isArray(autosave.addons)) {
          // New format: array of {id, name, unit, price}
          var addonMap = {};
          autosave.addons.forEach(function(a) { addonMap[a.id] = a; });
          extras.forEach(function(e) { e.on = !!addonMap[e.id]; });
        } else {
          // Legacy format: {removal, permit, stain}
          extras.forEach(function(e) {
            if (e.id === 'removal') e.on = !!autosave.addons.removal;
            else if (e.id === 'permit') e.on = !!autosave.addons.permit;
            else if (e.id === 'stain') e.on = !!autosave.addons.stain;
          });
        }
        renderExtras();
      }

      // Restore gates
      if (autosave.gates && autosave.gates.length > 0) {
        setTool('gate');
        autosave.gates.forEach(function(g) { addGate(L.latLng(g.lat, g.lng)); var gate = gates[gates.length-1]; gate.type = g.type; gate.price = g.price; });
        renderGates();
        setTool('draw');
      }

      // Restore mulch
      if (autosave.mulchAreas && autosave.mulchAreas.length > 0) {
        if (autosave.mulchMaterial) selectedMulchMaterial = autosave.mulchMaterial;
        if (autosave.mulchDepth) selectedMulchDepth = autosave.mulchDepth;
        if (autosave.mulchDelivery) selectedMulchDelivery = autosave.mulchDelivery;
        autosave.mulchAreas.forEach(function(a) { finalizeMulchArea(a.points); });
      }

      // Restore customer info
      if (autosave.customer) {
        if (autosave.customer.name) document.getElementById('cust-name').value = autosave.customer.name;
        if (autosave.customer.phone) document.getElementById('cust-phone').value = autosave.customer.phone;
        if (autosave.customer.address) document.getElementById('cust-address').value = autosave.customer.address;
      }

      // Restore markup
      if (autosave.laborPerFt) document.getElementById('markup-labor').value = autosave.laborPerFt;
      if (autosave.markupPct) document.getElementById('markup-percent').value = autosave.markupPct;

      // Restore exact map view
      if (autosave.mapView && autosave.mapZoom) {
        map.setView(autosave.mapView, autosave.mapZoom, { animate: false });
      }

      recalculate();
      showToast('Previous work restored');
    }
  } catch (e) {}
}

// Clear autosave when estimate is saved or reset
var _origResetEstimate = typeof resetEstimate === 'function' ? resetEstimate : null;
function resetEstimateAndClearAutosave() {
  localStorage.removeItem('fc_autosave');
  if (_origResetEstimate) _origResetEstimate();
}

// First visit: load demo estimate so visitors see the product immediately
if (fencePoints.length === 0 && mulchAreas.length === 0 && !_hadSharedURL && !localStorage.getItem('fc_visited')) {
  localStorage.setItem('fc_visited', '1');
  loadDemo(1);
  // Show "Try it yourself" banner after demo loads
  setTimeout(function() {
    var banner = document.createElement('div');
    banner.id = 'demo-banner';
    banner.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:9000;background:var(--text,#2c2417);color:#fff;padding:12px 20px;border-radius:12px;font-family:var(--font,Inter,sans-serif);font-size:0.9rem;display:flex;align-items:center;gap:12px;box-shadow:0 4px 20px rgba(0,0,0,0.3)';
    banner.innerHTML = '<span>This is a sample estimate</span>' +
      '<button onclick="resetEstimate(); document.getElementById(\'demo-banner\').remove()" style="background:#c0622e;color:#fff;border:none;padding:8px 16px;border-radius:8px;font-weight:700;cursor:pointer;font-size:0.85rem;white-space:nowrap">Try It Yourself</button>' +
      '<button onclick="this.parentElement.remove()" style="background:none;border:none;color:#999;cursor:pointer;font-size:18px">&times;</button>';
    document.body.appendChild(banner);
  }, 2000);
} else if (fencePoints.length === 0 && !_hadSharedURL) {
  hintFirstVisit();
  showQuickStart();
}
