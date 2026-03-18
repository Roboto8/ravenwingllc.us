// === API Client ===
const API = {
  baseUrl: '', // Set after deploy

  configure(url) {
    this.baseUrl = url.replace(/\/$/, '');
  },

  async _fetch(path, opts = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...Auth.getAuthHeader()
    };

    const resp = await fetch(this.baseUrl + path, { ...opts, headers });
    const data = await resp.json();

    if (resp.status === 401) {
      try {
        await Auth.refresh();
        headers.Authorization = 'Bearer ' + Auth.tokens.idToken;
        const retry = await fetch(this.baseUrl + path, { ...opts, headers });
        return retry.json();
      } catch (e) {
        Auth.logout();
        showAuthUI();
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
    const q = cursor ? '?cursor=' + cursor : '';
    return this._fetch('/api/estimates' + q);
  },
  createEstimate(data) { return this._fetch('/api/estimates', { method: 'POST', body: JSON.stringify(data) }); },
  getEstimate(id) { return this._fetch('/api/estimates/' + id); },
  updateEstimate(id, data) { return this._fetch('/api/estimates/' + id, { method: 'PUT', body: JSON.stringify(data) }); },
  deleteEstimate(id) { return this._fetch('/api/estimates/' + id, { method: 'DELETE' }); },
  getTrash() { return this._fetch('/api/estimates/trash'); },
  restoreEstimate(id) { return this._fetch('/api/estimates/' + id + '/restore', { method: 'POST' }); },
  shareEstimate(id) { return this._fetch('/api/estimates/' + id + '/share', { method: 'POST' }); },

  // Public (no auth) — approval workflow
  getPublicEstimate(token) {
    return fetch(this.baseUrl + '/api/public/estimate/' + token)
      .then(r => r.json()).then(d => { if (d.error) throw new Error(d.error); return d; });
  },
  respondEstimate(token, action, message) {
    return fetch(this.baseUrl + '/api/public/estimate/' + token + '/respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, message: message || '' })
    }).then(r => r.json()).then(d => { if (d.error) throw new Error(d.error); return d; });
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
  createCheckout(returnUrl, tier) { return this._fetch('/api/billing/checkout', { method: 'POST', body: JSON.stringify({ returnUrl, tier: tier || 'pro' }) }); },
  createPortal(returnUrl) { return this._fetch('/api/billing/portal', { method: 'POST', body: JSON.stringify({ returnUrl }) }); },
  exportData() { return this._fetch('/api/billing/export'); },

  // Reports
  getReports(period) {
    const q = period ? '?period=' + period : '';
    return this._fetch('/api/reports/dashboard' + q);
  },

  // Notifications
  getNotifications() { return this._fetch('/api/notifications'); },
  markNotificationsRead(ids) {
    const body = ids ? { ids } : { all: true };
    return this._fetch('/api/notifications/read', { method: 'POST', body: JSON.stringify(body) });
  }
};
