module.exports = {
  parseBody(event) {
    try {
      return JSON.parse(event.body || '{}');
    } catch (e) {
      return null;
    }
  },
  ok(body) {
    return { statusCode: 200, body: JSON.stringify(body) };
  },
  created(body) {
    return { statusCode: 201, body: JSON.stringify(body) };
  },
  bad(msg) {
    return { statusCode: 400, body: JSON.stringify({ error: msg }) };
  },
  forbidden(msg) {
    return { statusCode: 403, body: JSON.stringify({ error: msg || 'Forbidden' }) };
  },
  notFound(msg) {
    return { statusCode: 404, body: JSON.stringify({ error: msg || 'Not found' }) };
  },
  tooMany(msg) {
    return { statusCode: 429, body: JSON.stringify({ error: msg || 'Too many requests' }) };
  },
  error(msg) {
    return { statusCode: 500, body: JSON.stringify({ error: msg || 'Internal error' }) };
  },
  wrap(handler) {
    return async (event) => {
      try {
        return await handler(event);
      } catch (err) {
        console.error('Handler error:', err.message);
        return { statusCode: 500, body: JSON.stringify({ error: 'Internal error' }) };
      }
    };
  }
};
