/**
 * Tests for geolocation-based map centering logic.
 * Verifies that the map centers on the user's location when no shared link
 * or saved data is present, and falls back to defaults otherwise.
 */

describe('Geolocation map centering', () => {
  let setViewCalls;
  let geoSuccessCallback;
  let geoErrorCallback;
  let geoOptions;

  // Minimal Leaflet + DOM mocks
  beforeEach(() => {
    setViewCalls = [];
    geoSuccessCallback = null;
    geoErrorCallback = null;
    geoOptions = null;

    // Mock navigator.geolocation
    global.navigator = {
      geolocation: {
        getCurrentPosition: jest.fn((success, error, opts) => {
          geoSuccessCallback = success;
          geoErrorCallback = error;
          geoOptions = opts;
        })
      }
    };

    // Mock window.location
    global.window = { location: { search: '' } };

    // Mock URLSearchParams
    global.URLSearchParams = class {
      constructor(search) { this._search = search; }
      get(key) {
        if (!this._search) return null;
        const match = this._search.match(new RegExp('[?&]' + key + '=([^&]+)'));
        return match ? decodeURIComponent(match[1]) : null;
      }
    };
  });

  afterEach(() => {
    delete global.navigator;
    delete global.window;
    delete global.URLSearchParams;
  });

  // Extract the init logic into a testable function that mirrors app.js behavior
  function simulateMapInit(searchParams) {
    if (searchParams) global.window.location.search = searchParams;

    var initCenter = [37.6068, -77.3732];
    var initZoom = 18;
    try {
      var ep = new URLSearchParams(global.window.location.search).get('e');
      if (ep) {
        var sd = JSON.parse(atob(ep));
        if (sd.vw && sd.vz) {
          initCenter = sd.vw;
          initZoom = sd.vz;
        } else if (sd.p && sd.p.length > 0) {
          initCenter = sd.p[0];
          initZoom = sd.vz || 19;
        }
      }
    } catch (e) {}

    var usingDefault = initCenter[0] === 37.6068 && initCenter[1] === -77.3732;

    // Simulate map.setView
    var map = {
      setView: function(coords, zoom, opts) {
        setViewCalls.push({ coords, zoom, opts });
      }
    };

    // The geolocation logic from app.js
    if (usingDefault && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(function(pos) {
        map.setView([pos.coords.latitude, pos.coords.longitude], 18, { animate: true });
      }, function() {}, { timeout: 5000, maximumAge: 300000 });
    }

    return { initCenter, initZoom, usingDefault, map };
  }

  test('requests geolocation when no shared link data', () => {
    simulateMapInit('');
    expect(navigator.geolocation.getCurrentPosition).toHaveBeenCalledTimes(1);
  });

  test('does not request geolocation when shared link has coordinates', () => {
    var data = { vw: [40.7128, -74.006], vz: 17 };
    var encoded = '?e=' + btoa(JSON.stringify(data));
    var result = simulateMapInit(encoded);
    expect(navigator.geolocation.getCurrentPosition).not.toHaveBeenCalled();
    expect(result.initCenter).toEqual([40.7128, -74.006]);
    expect(result.initZoom).toBe(17);
  });

  test('does not request geolocation when shared link has fence points', () => {
    var data = { p: [[35.2271, -80.8431], [35.2275, -80.8435]], vz: 19 };
    var encoded = '?e=' + btoa(JSON.stringify(data));
    var result = simulateMapInit(encoded);
    expect(navigator.geolocation.getCurrentPosition).not.toHaveBeenCalled();
    expect(result.initCenter).toEqual([35.2271, -80.8431]);
  });

  test('centers map on user location when geolocation succeeds', () => {
    simulateMapInit('');
    expect(geoSuccessCallback).toBeTruthy();

    // Simulate browser providing location
    geoSuccessCallback({
      coords: { latitude: 51.5074, longitude: -0.1278 }
    });

    expect(setViewCalls).toHaveLength(1);
    expect(setViewCalls[0].coords).toEqual([51.5074, -0.1278]);
    expect(setViewCalls[0].zoom).toBe(18);
    expect(setViewCalls[0].opts).toEqual({ animate: true });
  });

  test('does not crash when geolocation is denied', () => {
    simulateMapInit('');
    expect(geoErrorCallback).toBeTruthy();

    // Simulate user denying permission
    geoErrorCallback({ code: 1, message: 'User denied Geolocation' });

    expect(setViewCalls).toHaveLength(0);
  });

  test('uses correct geolocation options', () => {
    simulateMapInit('');
    expect(geoOptions).toEqual({
      timeout: 5000,
      maximumAge: 300000
    });
  });

  test('defaults to Richmond VA when no geolocation available', () => {
    delete global.navigator.geolocation;
    global.navigator = {};
    var result = simulateMapInit('');
    expect(result.initCenter).toEqual([37.6068, -77.3732]);
    expect(result.initZoom).toBe(18);
    expect(result.usingDefault).toBe(true);
  });

  test('handles malformed shared link data gracefully', () => {
    var result = simulateMapInit('?e=not-valid-base64!!!');
    expect(result.usingDefault).toBe(true);
    // Should still try geolocation since it fell back to default
    expect(navigator.geolocation.getCurrentPosition).toHaveBeenCalledTimes(1);
  });
});
