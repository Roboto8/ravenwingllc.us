// === State ===
let map;
let currentTool = 'draw';
let curveMode = false;

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

// Mulch areas
let mulchAreas = []; // array of { points, markers, polygon, labels, materialType, depth, deliveryMode }
let activeMulchPoints = []; // points being drawn for current mulch area (polygon mode)
let activeMulchMarkers = [];
let activeMulchPolygon = null;
let mulchDragStart = null; // for click-drag rectangle mode
let mulchDragRect = null; // L.rectangle during drag
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
    fenceHeight: selectedHeight
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
  s.closed = fenceClosed;
  s.curveMode = curveMode;
  s.fenceType = selectedFence.type;
  s.fencePrice = selectedFence.price;
  s.fenceHeight = selectedHeight;
}

function loadActiveSection() {
  var s = sections[activeSectionIdx];
  fencePoints = s.points;
  fenceMarkers = s.markers;
  fenceLine = s.line;
  segmentLabels = s.labels;
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
}
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

  // Scale bar — shows real-world distance on the map
  L.control.scale({
    imperial: true,
    metric: false,
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

    div.innerHTML = '<span style="color:' + color + '">' + accuracy + '</span> ~' + feetPerPixel.toFixed(1) + ' ft/px';
    div.title = 'Zoom ' + zoom + ' — each pixel ≈ ' + feetPerPixel.toFixed(1) + ' feet. Zoom in for more precise placement.';
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
    attribution: 'Imagery &copy; Google'
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
  // Remove old corners
  droneCorners.forEach(function(m) { map.removeLayer(m); });
  droneCorners = [];

  var corners = [
    bounds.getSouthWest(),
    bounds.getNorthWest(),
    bounds.getNorthEast(),
    bounds.getSouthEast()
  ];

  corners.forEach(function(latlng, idx) {
    var marker = L.marker(latlng, {
      draggable: true,
      icon: L.divIcon({
        className: 'drone-handle',
        html: '<div style="width:14px;height:14px;background:#c0622e;border:2px solid #fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.4);cursor:move"></div>',
        iconSize: [14, 14],
        iconAnchor: [7, 7]
      })
    }).addTo(map);

    marker.on('drag', function() {
      updateDroneFromCorners();
    });
    marker.on('dragend', function() {
      updateDroneFromCorners();
      markUnsaved();
    });

    droneCorners.push(marker);
  });
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
  } else if (currentTool === 'mulch' && e.originalEvent && e.originalEvent.shiftKey) {
    // Shift+click: polygon mode for irregular shapes
    addMulchPoint(e.latlng);
  }
  // Regular mulch click-drag is handled by mousedown/mousemove/mouseup below
}

// === Segment Labels ===
function createSegmentLabel(p1, p2, segIndex) {
  var meters = p1.distanceTo(p2);
  var feet = Math.round(meters * 3.28084);
  var midLat = (p1.lat + p2.lat) / 2;
  var midLng = (p1.lng + p2.lng) / 2;

  var label = L.marker([midLat, midLng], {
    icon: L.divIcon({
      className: 'segment-label',
      html: '<div class="seg-label seg-clickable" data-seg="' + segIndex + '">' +
        '<span onclick="editSegmentLength(' + segIndex + ', event)">' + feet + ' ft</span>' +
        '<button class="seg-delete" onclick="event.stopPropagation(); deleteSegment(' + segIndex + ')" title="Remove segment">&times;</button>' +
      '</div>',
      iconSize: [80, 20],
      iconAnchor: [30, 10]
    }),
    interactive: true
  }).addTo(map);

  return label;
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
  // Bearing from p2 to p1
  var dLng1 = (p1.lng - p2.lng) * Math.PI / 180;
  var dLat1 = (p1.lat - p2.lat) * Math.PI / 180;
  var bearing1 = Math.atan2(dLng1, dLat1) * 180 / Math.PI;

  // Bearing from p2 to p3
  var dLng2 = (p3.lng - p2.lng) * Math.PI / 180;
  var dLat2 = (p3.lat - p2.lat) * Math.PI / 180;
  var bearing2 = Math.atan2(dLng2, dLat2) * 180 / Math.PI;

  var angle = Math.abs(bearing2 - bearing1);
  if (angle > 180) angle = 360 - angle;

  return Math.round(angle);
}

function createAngleLabel(point, angle) {
  var label = L.marker(point, {
    icon: L.divIcon({
      className: 'angle-label',
      html: '<div class="angle-tag">' + angle + '&deg;</div>',
      iconSize: [36, 18],
      iconAnchor: [18, -6]
    }),
    interactive: false
  }).addTo(map);
  return label;
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
    recalculateDrag();
  });

  marker.on('dragend', function() {
    redrawSegmentLabels();
    recalculate();
  });

  fenceMarkers.push(marker);

  // Push to undo stack
  undoStack.push({ type: 'point', sectionIdx: activeSectionIdx });

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
  document.getElementById('total-feet').textContent = totalFeet.toLocaleString();
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

  gateMarkers.push({ id: gateId, marker: marker });

  // Push to undo stack
  undoStack.push({ type: 'gate', id: gateId });

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
  currentTool = tool;
  document.querySelectorAll('.tool-btn:not(#close-btn)').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById(tool + '-btn');
  if (btn) btn.classList.add('active');

  map.getContainer().style.cursor = tool === 'draw' ? 'crosshair' : tool === 'gate' ? 'cell' : tool === 'mulch' ? 'crosshair' : '';

  if (tool === 'mulch') {
    showToast('Drag to draw a bed. Then drag to move, corners to resize, orange dot to rotate.');
  }
}

// === Undo Stack ===
var undoStack = [];

function undoLast() {
  // Mulch undo: if drawing polygon points, remove last point; otherwise remove last placed area
  if (currentTool === 'mulch') {
    if (activeMulchPoints.length > 0) {
      activeMulchPoints.pop();
      var mp = activeMulchMarkers.pop();
      if (mp) map.removeLayer(mp);
      redrawActiveMulchPolygon();
      markUnsaved();
      return;
    }
    if (mulchAreas.length > 0) {
      removeMulchArea(mulchAreas.length - 1);
      showToast('Mulch area removed');
      return;
    }
  }

  // If fence is closed, open it first
  if (fenceClosed) {
    openFence();
    return;
  }

  if (undoStack.length === 0) return;

  var last = undoStack.pop();

  if (last.type === 'gate') {
    // Undo gate placement
    var gateId = last.id;
    var gm = gateMarkers.find(function(g) { return g.id === gateId; });
    if (gm) {
      map.removeLayer(gm.marker);
      gateMarkers = gateMarkers.filter(function(g) { return g.id !== gateId; });
    }
    gates = gates.filter(function(g) { return g.id !== gateId; });
    renderGates();
    recalculate();
    markUnsaved();
    showToast(t('toast_gate_removed'));

  } else if (last.type === 'point') {
    // Undo fence point — switch to the right section if needed
    if (last.sectionIdx !== activeSectionIdx) {
      switchSection(last.sectionIdx);
    }

    if (fencePoints.length > 0) {
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

const MULCH = {
  hardwood: { name: 'Hardwood Mulch', bagCuFt: 2, bagCost: 4.50, bulkCuYdCost: 35 },
  cedar: { name: 'Cedar Mulch', bagCuFt: 2, bagCost: 5.50, bulkCuYdCost: 45 },
  cypress: { name: 'Cypress Mulch', bagCuFt: 2, bagCost: 5.00, bulkCuYdCost: 40 },
  'pine-bark': { name: 'Pine Bark Mulch', bagCuFt: 2, bagCost: 4.00, bulkCuYdCost: 30 },
  'dyed-black': { name: 'Dyed Black Mulch', bagCuFt: 2, bagCost: 4.75, bulkCuYdCost: 38 },
  'dyed-red': { name: 'Dyed Red Mulch', bagCuFt: 2, bagCost: 4.75, bulkCuYdCost: 38 },
  rubber: { name: 'Rubber Mulch', bagCuFt: 0.8, bagCost: 8.00, bulkCuYdCost: 120 },
  'river-rock': { name: 'River Rock', bagCuFt: 0.5, bagCost: 6.00, bulkCuYdCost: 75 },
  'pea-gravel': { name: 'Pea Gravel', bagCuFt: 0.5, bagCost: 5.50, bulkCuYdCost: 50 },
  'lava-rock': { name: 'Lava Rock', bagCuFt: 0.5, bagCost: 7.00, bulkCuYdCost: 110 }
};

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
    items.push({ name: mat.name + ' (2 cu ft bags)', qty: Math.ceil(cubicFeet / mat.bagCuFt), unit: 'bags', unitCost: mp('bagCost', mat.bagCost) });
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

  // Apply qty overrides
  bom.items.forEach(function(i) {
    if (bomQtyOverrides[i.name] !== undefined) {
      i.qty = bomQtyOverrides[i.name];
      i.total = Math.round(i.qty * i.unitCost * 100) / 100;
    }
  });

  // Recalc total
  bom.materialTotal = bom.items.reduce(function(sum, i) { return sum + i.total; }, 0);
  bom.materialTotal = Math.round(bom.materialTotal);

  container.innerHTML = bom.items.map(function(i) {
    if (i.isHeader) {
      return '<div class="bom-section-header">' + i.name + '</div>';
    }
    var isOverridden = bomQtyOverrides[i.name] !== undefined;
    return '<div class="bom-row">' +
      '<span class="bom-name">' + i.name + '</span>' +
      '<input type="number" class="bom-qty" value="' + i.qty + '" min="0" ' +
        'onchange="updateBomQty(\'' + i.name.replace(/'/g, "\\'") + '\', this.value)" ' +
        'title="' + i.qty + ' ' + i.unit + (isOverridden ? ' (edited)' : '') + '">' +
      '<span class="bom-cost">$' + i.total.toLocaleString() + '</span>' +
    '</div>';
  }).join('');

  document.getElementById('bom-total').textContent = '$' + bom.materialTotal.toLocaleString();
}

function updateBomQty(name, value) {
  var qty = parseInt(value) || 0;
  bomQtyOverrides[name] = qty;
  recalculate();
}

function resetBomOverrides() {
  bomQtyOverrides = {};
  recalculate();
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
  recalculate();
}

// --- Click-drag rectangle mode (default) ---
function initMulchDragHandlers() {
  // Use Leaflet events instead of raw DOM to avoid stealing events from other tools
  map.on('mousedown', function(e) {
    if (currentTool !== 'mulch' || (e.originalEvent && e.originalEvent.shiftKey)) return;
    if (e.originalEvent && e.originalEvent.button !== 0) return;

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
function addMulchPoint(latlng) {
  activeMulchPoints.push(latlng);

  var marker = L.circleMarker(latlng, {
    radius: 6, color: '#2d8a4e', fillColor: '#2d8a4e', fillOpacity: 0.8, weight: 2
  }).addTo(map);
  activeMulchMarkers.push(marker);

  redrawActiveMulchPolygon();

  if (activeMulchPoints.length === 3) {
    showToast('Double-click to close the area');
  }

  // Check if clicking near first point to close
  if (activeMulchPoints.length > 3) {
    var first = map.latLngToContainerPoint(activeMulchPoints[0]);
    var clicked = map.latLngToContainerPoint(latlng);
    if (first.distanceTo(clicked) < 20) {
      activeMulchPoints.pop();
      map.removeLayer(activeMulchMarkers.pop());
      closeMulchArea();
      return;
    }
  }

  markUnsaved();
}

function redrawActiveMulchPolygon() {
  if (activeMulchPolygon) { map.removeLayer(activeMulchPolygon); activeMulchPolygon = null; }
  if (activeMulchPoints.length >= 3) {
    activeMulchPolygon = L.polygon(activeMulchPoints, {
      color: '#2d8a4e', fillColor: '#2d8a4e', fillOpacity: 0.2, weight: 2, dashArray: '6,4'
    }).addTo(map);
  }
}

function closeMulchArea() {
  if (activeMulchPoints.length < 3) {
    showToast('Need at least 3 points to create an area');
    return;
  }
  var pts = activeMulchPoints.map(function(p) { return { lat: p.lat, lng: p.lng }; });

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
    if (area.rotMarker) map.removeLayer(area.rotMarker);
    if (area.rotLine) map.removeLayer(area.rotLine);
    mulchAreas.splice(idx, 1);
  });

  return convexHull(allPts);
}

function getMulchLabelHtml(areaSqFt, points) {
  var mat = MULCH[selectedMulchMaterial];
  if (!mat) return '<div class="mulch-label">' + areaSqFt.toLocaleString() + ' sq ft</div>';

  var cubicFeet = (areaSqFt * selectedMulchDepth) / 12;
  var line2 = '';
  if (selectedMulchDelivery === 'bags') {
    var bags = Math.ceil(cubicFeet / mat.bagCuFt);
    line2 = bags + ' bags';
  } else {
    var cuYd = Math.ceil(cubicFeet / 27 * 10) / 10;
    line2 = cuYd + ' cu yd';
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
    dims = '<span style="font-size:10px;opacity:0.7">' + side1 + '×' + side2 + ' ft</span><br>';
  }

  return '<div class="mulch-label">' + dims + areaSqFt.toLocaleString() + ' sq ft<br><span style="font-size:10px;opacity:0.8">' + line2 + '</span></div>';
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
    color: '#2d8a4e', fillColor: '#2d8a4e', fillOpacity: 0.25, weight: 2,
    interactive: true, bubblingMouseEvents: false
  }).addTo(map);
  polygon.getElement && polygon.getElement() && (polygon.getElement().style.cursor = 'move');

  // Corner markers for dragging (white fill = resize handle)
  var markers = points.map(function(p) {
    var m = L.circleMarker([p.lat, p.lng], {
      radius: 5, color: '#2d8a4e', fillColor: '#fff', fillOpacity: 1, weight: 2,
      interactive: true, bubblingMouseEvents: false
    }).addTo(map);
    m.getElement && m.getElement() && (m.getElement().style.cursor = 'nwse-resize');
    return m;
  });

  // Rotation handle — positioned above the top-center of the shape
  var rotCenter = getMulchCenter(points);
  var rotHandlePos = getRotationHandlePos(points, rotCenter);
  var rotMarker = L.circleMarker(rotHandlePos, {
    radius: 6, color: '#c0622e', fillColor: '#c0622e', fillOpacity: 0.9, weight: 2,
    interactive: true, bubblingMouseEvents: false
  }).addTo(map);
  rotMarker.getElement && rotMarker.getElement() && (rotMarker.getElement().style.cursor = 'grab');

  // Rotation line connecting center to handle
  var rotLine = L.polyline([rotCenter, rotHandlePos], {
    color: '#c0622e', weight: 1, dashArray: '4,4', opacity: 0.6
  }).addTo(map);

  // Area label in center with bag count
  var areaLabel = L.marker(rotCenter, {
    icon: L.divIcon({
      className: 'mulch-area-label',
      html: getMulchLabelHtml(areaSqFt, points),
      iconSize: [120, 48],
      iconAnchor: [60, 24]
    }),
    interactive: false
  }).addTo(map);

  var area = {
    points: points,
    markers: markers,
    polygon: polygon,
    areaLabel: areaLabel,
    rotMarker: rotMarker,
    rotLine: rotLine,
    areaSqFt: areaSqFt,
    perimeterFt: perimeterFt,
    materialType: selectedMulchMaterial,
    depth: selectedMulchDepth,
    deliveryMode: selectedMulchDelivery
  };
  mulchAreas.push(area);

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
  area.areaLabel.setLatLng(center);
  area.areaLabel.setIcon(L.divIcon({
    className: 'mulch-area-label',
    html: getMulchLabelHtml(newArea, area.points),
    iconSize: [120, 48], iconAnchor: [60, 24]
  }));
  var rotPos = getRotationHandlePos(area.points, center);
  area.rotMarker.setLatLng(rotPos);
  area.rotLine.setLatLngs([center, rotPos]);
}

function rebindMulchMarkerDrags(areaIdx) {
  var area = mulchAreas[areaIdx];
  if (!area) return;

  // Corner drag — move individual points
  area.markers.forEach(function(marker, ptIdx) {
    marker.off('mousedown');
    marker.on('mousedown', function(e) {
      map.dragging.disable();
      var onMove = function(ev) {
        area.points[ptIdx] = { lat: ev.latlng.lat, lng: ev.latlng.lng };
        updateMulchAreaVisuals(area);
      };
      var onUp = function() {
        map.off('mousemove', onMove);
        map.off('mouseup', onUp);
        map.dragging.enable();
        renderMulchAreas();
        recalculate();
        markUnsaved();
      };
      map.on('mousemove', onMove);
      map.on('mouseup', onUp);
      L.DomEvent.stopPropagation(e);
    });
  });

  // Polygon body drag — move the whole shape
  area.polygon.off('mousedown');
  area.polygon.on('mousedown', function(e) {
    map.dragging.disable();
    var startLat = e.latlng.lat;
    var startLng = e.latlng.lng;
    var origPoints = area.points.map(function(p) { return { lat: p.lat, lng: p.lng }; });

    var onMove = function(ev) {
      var dLat = ev.latlng.lat - startLat;
      var dLng = ev.latlng.lng - startLng;
      area.points = origPoints.map(function(p) {
        return { lat: p.lat + dLat, lng: p.lng + dLng };
      });
      updateMulchAreaVisuals(area);
    };
    var onUp = function() {
      map.off('mousemove', onMove);
      map.off('mouseup', onUp);
      map.dragging.enable();
      renderMulchAreas();
      recalculate();
      markUnsaved();
    };
    map.on('mousemove', onMove);
    map.on('mouseup', onUp);
    L.DomEvent.stopPropagation(e);
  });

  // Rotation handle drag
  area.rotMarker.off('mousedown');
  area.rotMarker.on('mousedown', function(e) {
    map.dragging.disable();
    var center = getMulchCenter(area.points);
    var startAngle = Math.atan2(
      e.latlng.lng - center.lng,
      e.latlng.lat - center.lat
    );
    var origPoints = area.points.map(function(p) { return { lat: p.lat, lng: p.lng }; });

    var onMove = function(ev) {
      var curAngle = Math.atan2(
        ev.latlng.lng - center.lng,
        ev.latlng.lat - center.lat
      );
      var delta = (curAngle - startAngle) * 180 / Math.PI;
      area.points = origPoints.map(function(p) { return rotatePoint(p, center, delta); });
      updateMulchAreaVisuals(area);
    };
    var onUp = function() {
      map.off('mousemove', onMove);
      map.off('mouseup', onUp);
      map.dragging.enable();
      renderMulchAreas();
      recalculate();
      markUnsaved();
    };
    map.on('mousemove', onMove);
    map.on('mouseup', onUp);
    L.DomEvent.stopPropagation(e);
  });
}

function removeMulchArea(idx) {
  var area = mulchAreas[idx];
  if (!area) return;

  area.markers.forEach(function(m) { map.removeLayer(m); });
  if (area.polygon) map.removeLayer(area.polygon);
  if (area.areaLabel) map.removeLayer(area.areaLabel);
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
  if (!list) return;

  if (mulchAreas.length === 0) {
    list.innerHTML = '<p class="empty-state">Draw areas on the map with the Mulch tool</p>';
    return;
  }

  var mat = MULCH[selectedMulchMaterial];
  var html = '';
  mulchAreas.forEach(function(area, idx) {
    var cubicFeet = (area.areaSqFt * selectedMulchDepth) / 12;
    var qtyStr = '';
    if (mat) {
      if (selectedMulchDelivery === 'bags') {
        qtyStr = ' · ' + Math.ceil(cubicFeet / mat.bagCuFt) + ' bags';
      } else {
        qtyStr = ' · ' + (Math.ceil(cubicFeet / 27 * 10) / 10) + ' cu yd';
      }
    }
    html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid var(--border)">' +
      '<span style="font-size:12px">Area ' + (idx + 1) + ': ' + area.areaSqFt.toLocaleString() + ' sq ft' + qtyStr + '</span>' +
      '<button onclick="removeMulchArea(' + idx + ')" title="Remove area" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:16px">&times;</button>' +
    '</div>';
  });
  list.innerHTML = html;

  // Update map labels too
  mulchAreas.forEach(function(area) {
    area.areaLabel.setIcon(L.divIcon({
      className: 'mulch-area-label',
      html: getMulchLabelHtml(area.areaSqFt, area.points),
      iconSize: [120, 48], iconAnchor: [60, 24]
    }));
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
function recalculate() {
  const feet = updateFootage();
  // Scale price/ft based on height (6ft is baseline)
  const heightMult = selectedHeight <= 4 ? 0.8 : selectedHeight >= 8 ? 1.3 : (0.8 + (selectedHeight - 4) * 0.125);

  let fenceCost = feet * selectedFence.price * heightMult;
  const gateCost = gates.reduce((sum, g) => sum + g.price, 0);
  const removal = document.getElementById('addon-removal').checked ? feet * 3 : 0;
  const permit = document.getElementById('addon-permit').checked ? 150 : 0;
  const stain = document.getElementById('addon-stain').checked ? feet * 4 : 0;

  fenceCost *= terrainMultiplier;
  const mulchResult = calculateMulchTotal();
  const mulchCost = mulchResult.total;
  const customTotal = customItems.reduce((sum, i) => sum + (i.qty * i.unitCost), 0);
  const total = fenceCost + gateCost + removal + permit + stain + mulchCost + customTotal;

  // Update summary
  var fenceTypeKey = 'fence_' + selectedFence.type.replace('-', '_');
  document.getElementById('sum-type').textContent = t(fenceTypeKey);
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

  document.getElementById('row-mulch').style.display = mulchCost > 0 ? 'flex' : 'none';
  document.getElementById('sum-mulch').textContent = '$' + Math.round(mulchCost).toLocaleString();
  document.getElementById('mulch-total-row').style.display = mulchCost > 0 ? 'flex' : 'none';
  document.getElementById('mulch-total').textContent = '$' + Math.round(mulchCost).toLocaleString();

  document.getElementById('row-custom').style.display = customTotal > 0 ? 'flex' : 'none';
  document.getElementById('sum-custom').textContent = '$' + Math.round(customTotal).toLocaleString();

  document.getElementById('sum-total').textContent = '$' + Math.round(total).toLocaleString();

  // BOM — aggregate across all sections + mulch
  saveActiveSection();
  var combinedBOM = calculateCombinedBOM();

  // Append mulch BOM items
  if (mulchAreas.length > 0 && mulchResult.details.length > 0) {
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

  // Update mulch area labels (bag counts change with depth/material)
  if (mulchAreas.length > 0) renderMulchAreas();

  // Trigger contextual hints
  if (feet > 0) {
    setTimeout(hintBOMAppears, 600);
    setTimeout(hintAfterEstimate, 1200);
  }
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
        showToast(t('toast_addr_not_found'));
      }
    })
    .catch(function() { showToast(t('toast_search_failed')); });
}

document.getElementById('address-input').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') searchAddress();
});

// === Share / Approval Workflow ===
async function shareEstimate() {
  if (typeof Auth !== 'undefined' && !Auth.isLoggedIn()) {
    if (typeof requireAuth === 'function') requireAuth('share estimates');
    return;
  }

  // If we have a saved estimate loaded, use the approval workflow
  if (typeof activeEstimateId !== 'undefined' && activeEstimateId) {
    try {
      showToast('Generating approval link...');
      const result = await API.shareEstimate(activeEstimateId);
      const url = result.link;

      if (navigator.share) {
        navigator.share({ title: 'Fence Estimate — Review & Approve', url: url }).catch(() => {
          copyToClipboard(url);
        });
      } else {
        copyToClipboard(url);
      }
      showToast('Approval link copied!');
      return;
    } catch (e) {
      showToast('Could not generate approval link: ' + e.message);
      return;
    }
  }

  // Fallback: no saved estimate — use the old base64 share link
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
          gate.price = g.t === 'double' ? 550 : g.t === 'sliding' ? 1200 : 350;
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
      ctx.fillText(t('pdf_fence_layout') + ' — ' + updateFootage() + ' ' + t('pdf_linear_ft'), 12, 10);

      resolve(canvas.toDataURL('image/jpeg', 0.9));
    } catch (e) {
      resolve(null);
    }
  });
}

// === PDF Generation ===
async function generatePDF() {
  if (typeof Auth !== 'undefined' && !Auth.isLoggedIn()) {
    if (typeof requireAuth === 'function') requireAuth('download PDF estimates');
    return;
  }
  try {
  showToast(t('toast_generating_pdf'));

  // Capture map screenshot
  var mapImage = null;
  try {
    mapImage = await captureMap();
  } catch (e) {
    // Continue without map image
  }

  if (!window.jspdf) {
    showToast(t('toast_pdf_lib_error'));
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
  doc.text('FenceTrace', margin, y);
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

  // Photos note
  if (typeof activeEstimatePhotos !== 'undefined' && activeEstimatePhotos.length > 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(activeEstimatePhotos.length + ' photo' + (activeEstimatePhotos.length === 1 ? '' : 's') + ' attached to this estimate (see online version)', margin, y);
    y += 20;
  }

  // Footer
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(140, 127, 110);
  doc.text('This estimate is valid for 30 days. Actual costs may vary based on site conditions.', margin, y);
  doc.text('Generated by FenceTrace', margin, y + 12);

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
  clearUnsaved();
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
      document.getElementById('addon-stain').checked = true;

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

      document.getElementById('addon-permit').checked = true;

      recalculate();
      showToast('Demo loaded: Multi-section — Wood backyard + Aluminum front');
    }, 1000);
  }
}

// === Screenshot Prevention ===
// Block PrintScreen and common screenshot shortcuts
document.addEventListener('keydown', function(e) {
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
  }
}

// === Unsaved Changes Indicator ===
var hasUnsavedChanges = false;

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

  // Ctrl+Shift+Z: Clear all
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
    e.preventDefault();
    clearAll();
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
  if (fencePoints.length > 0) {
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
initDoubleClick();
initSections();
recalculate();
loadFromURL();
updateEmptyMapState();

// Increment estimate counter for a fresh session
if (fencePoints.length === 0) {
  nextEstimateNumber();
}
updateEstimateCounterDisplay();

// Show first-visit hint after a delay (if no shared estimate loaded)
if (fencePoints.length === 0) {
  hintFirstVisit();
  showQuickStart();
}
