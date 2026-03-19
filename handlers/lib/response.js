const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
  'Content-Type': 'application/json'
};

module.exports = {
  parseBody(event) {
    try {
      return JSON.parse(event.body || '{}');
    } catch (e) {
      return null;
    }
  },
  ok(body) {
    return { statusCode: 200, headers: SECURITY_HEADERS, body: JSON.stringify(body) };
  },
  created(body) {
    return { statusCode: 201, headers: SECURITY_HEADERS, body: JSON.stringify(body) };
  },
  bad(msg) {
    return { statusCode: 400, headers: SECURITY_HEADERS, body: JSON.stringify({ error: msg }) };
  },
  forbidden(msg) {
    return { statusCode: 403, headers: SECURITY_HEADERS, body: JSON.stringify({ error: msg || 'Forbidden' }) };
  },
  notFound(msg) {
    return { statusCode: 404, headers: SECURITY_HEADERS, body: JSON.stringify({ error: msg || 'Not found' }) };
  },
  tooMany(msg) {
    return { statusCode: 429, headers: SECURITY_HEADERS, body: JSON.stringify({ error: msg || 'Too many requests' }) };
  },
  error(msg) {
    return { statusCode: 500, headers: SECURITY_HEADERS, body: JSON.stringify({ error: msg || 'Internal error' }) };
  },
  wrap(handler) {
    return async (event) => {
      try {
        return await handler(event);
      } catch (err) {
        console.error('Handler error:', err.message);
        return { statusCode: 500, headers: SECURITY_HEADERS, body: JSON.stringify({ error: 'Internal error' }) };
      }
    };
  }
};
