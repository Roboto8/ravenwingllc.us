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

  // Billing
  getStatus() { return this._fetch('/api/billing/status'); },
  createCheckout(returnUrl) { return this._fetch('/api/billing/checkout', { method: 'POST', body: JSON.stringify({ returnUrl }) }); },
  createPortal(returnUrl) { return this._fetch('/api/billing/portal', { method: 'POST', body: JSON.stringify({ returnUrl }) }); }
};
