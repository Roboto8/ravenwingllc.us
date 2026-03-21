// === API Client ===
const API = {
  baseUrl: '', // Set after deploy
  _refreshPromise: null, // Mutex for token refresh

  configure(url) {
    this.baseUrl = url.replace(/\/$/, '');
  },

  // Retry with exponential backoff for transient failures
  async _fetchWithRetry(url, opts, retries = 2) {
    for (var attempt = 0; attempt <= retries; attempt++) {
      try {
        var controller = new AbortController();
        var timeoutId = setTimeout(function() { controller.abort(); }, 15000);
        var resp = await fetch(url, { ...opts, signal: controller.signal });
        clearTimeout(timeoutId);
        return resp;
      } catch (err) {
        clearTimeout(timeoutId);
        if (attempt === retries) throw err;
        // Exponential backoff: 500ms, 1500ms
        await new Promise(function(r) { setTimeout(r, 500 * Math.pow(3, attempt)); });
      }
    }
  },

  // Deduplicated token refresh — all concurrent 401s share one refresh call
  async _refreshOnce() {
    if (this._refreshPromise) return this._refreshPromise;
    this._refreshPromise = Auth.refresh().finally(() => { this._refreshPromise = null; });
    return this._refreshPromise;
  },

  async _fetch(path, opts = {}) {
    var headers = {
      'Content-Type': 'application/json',
      ...Auth.getAuthHeader()
    };

    var resp = await this._fetchWithRetry(this.baseUrl + path, { ...opts, headers });
    var data = await resp.json();

    if (resp.status === 401) {
      try {
        await this._refreshOnce();
        headers.Authorization = 'Bearer ' + Auth.tokens.idToken;
        var retry = await this._fetchWithRetry(this.baseUrl + path, { ...opts, headers });
        var retryData = await retry.json();
        if (!retry.ok) throw new Error(retryData.error || 'Request failed');
        return retryData;
      } catch (e) {
        Auth.logout();
        if (typeof showAuthUI === 'function') showAuthUI();
        throw new Error('Session expired');
      }
    }

    if (!resp.ok) throw new Error(data.error || 'Request failed');
    return data;
  },

  // Company
  getCompany() { return this._fetch('/api/company'); },
  updateCompany(data) { return this._fetch('/api/company', { method: 'PUT', body: JSON.stringify(data) }); },

  // Estimates
  listEstimates(cursor) {
    var q = cursor ? '?cursor=' + cursor : '';
    return this._fetch('/api/estimates' + q);
  },
  createEstimate(data) { return this._fetch('/api/estimates', { method: 'POST', body: JSON.stringify(data) }); },
  getEstimate(id) { return this._fetch('/api/estimates/' + id); },
  updateEstimate(id, data) { return this._fetch('/api/estimates/' + id, { method: 'PUT', body: JSON.stringify(data) }); },
  deleteEstimate(id) { return this._fetch('/api/estimates/' + id, { method: 'DELETE' }); },
  getTrash() { return this._fetch('/api/estimates/trash'); },
  restoreEstimate(id) { return this._fetch('/api/estimates/' + id + '/restore', { method: 'POST' }); },
  shareEstimate(id) { return this._fetch('/api/estimates/' + id + '/share', { method: 'POST' }); },

  // Public (no auth) — approval workflow (with retry for customer-facing reliability)
  async getPublicEstimate(token) {
    var resp = await this._fetchWithRetry(this.baseUrl + '/api/public/estimate/' + token, {});
    var data = await resp.json();
    if (data.error) throw new Error(data.error);
    return data;
  },
  async respondEstimate(token, action, message) {
    var resp = await this._fetchWithRetry(this.baseUrl + '/api/public/estimate/' + token + '/respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, message: message || '' })
    });
    var data = await resp.json();
    if (data.error) throw new Error(data.error);
    return data;
  },

  // Photos
  getPhotoUploadUrl(estId, filename, contentType) {
    return this._fetch('/api/estimates/' + estId + '/photos', {
      method: 'PUT',
      body: JSON.stringify({ filename, contentType })
    });
  },
  deletePhoto(estId, key) {
    return this._fetch('/api/estimates/' + estId + '/photos/' + encodeURIComponent(key), { method: 'DELETE' });
  },

  // Team
  getTeam() { return this._fetch('/api/team'); },
  inviteMember(email) { return this._fetch('/api/team/invite', { method: 'POST', body: JSON.stringify({ email }) }); },
  revokeInvite(token) { return this._fetch('/api/team/invite/' + token, { method: 'DELETE' }); },
  removeMember(email) { return this._fetch('/api/team/' + encodeURIComponent(email), { method: 'DELETE' }); },

  // Roles
  getRoles() { return this._fetch('/api/roles'); },
  createRole(data) { return this._fetch('/api/roles', { method: 'POST', body: JSON.stringify(data) }); },
  updateRole(name, data) { return this._fetch('/api/roles/' + name, { method: 'PUT', body: JSON.stringify(data) }); },
  deleteRole(name) { return this._fetch('/api/roles/' + name, { method: 'DELETE' }); },
  assignRole(email, role) { return this._fetch('/api/roles/assign', { method: 'POST', body: JSON.stringify({ email, role }) }); },

  // Billing
  getStatus() { return this._fetch('/api/billing/status'); },
  createCheckout(returnUrl, tier) { return this._fetch('/api/billing/checkout', { method: 'POST', body: JSON.stringify({ returnUrl, tier: tier || 'contractor' }) }); },
  createPortal(returnUrl) { return this._fetch('/api/billing/portal', { method: 'POST', body: JSON.stringify({ returnUrl }) }); },
  exportData() { return this._fetch('/api/billing/export'); },
  claimShareBonus() { return this._fetch('/api/billing/share-bonus', { method: 'POST' }); },

  // Reports
  getReports(period) {
    var q = period ? '?period=' + period : '';
    return this._fetch('/api/reports/dashboard' + q);
  },

  // Notifications
  getNotifications() { return this._fetch('/api/notifications'); },
  markNotificationsRead(ids) {
    var body = ids ? { ids } : { all: true };
    return this._fetch('/api/notifications/read', { method: 'POST', body: JSON.stringify(body) });
  }
};
