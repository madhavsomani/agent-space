(function (global) {
  'use strict';

  const STORAGE_KEY = 'agent-space-gateway-connection';
  const LEGACY_TOKEN_KEY = 'agent-space-token';
  const DEFAULT_TIMEOUT_MS = 10000;

  function normalizeGatewayUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
    const url = new URL(withScheme);
    url.pathname = url.pathname.replace(/\/+$/, '');
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  }

  function redactToken(text) {
    return String(text || '')
      .replace(/(Authorization\s*:\s*Bearer\s+)[^\s,;]+/gi, '$1[redacted]')
      .replace(/(token=)[^\s&]+/gi, '$1[redacted]')
      .replace(/(gatewayToken|token|apiKey)(["'\s:=]+)([^"'\s,}]+)/gi, '$1$2[redacted]');
  }

  function safeStorage(storage) {
    try {
      const probe = '__agent_space_storage_probe__';
      storage.setItem(probe, '1');
      storage.removeItem(probe);
      return storage;
    } catch {
      return null;
    }
  }

  function readStoredConnection() {
    const query = new URLSearchParams(global.location?.search || '');
    const urlFromQuery = query.get('gateway') || query.get('gatewayUrl') || '';
    const tokenFromQuery = query.get('token') || '';
    if (urlFromQuery || tokenFromQuery) {
      return {
        gatewayUrl: urlFromQuery,
        token: tokenFromQuery,
        persistence: 'session',
        source: 'query'
      };
    }

    for (const [storage, source] of [[safeStorage(global.localStorage), 'local'], [safeStorage(global.sessionStorage), 'session']]) {
      if (!storage) continue;
      try {
        const raw = storage.getItem(STORAGE_KEY);
        if (raw) return { ...JSON.parse(raw), source };
      } catch {}
    }

    const legacyToken = safeStorage(global.localStorage)?.getItem(LEGACY_TOKEN_KEY) || '';
    if (legacyToken) return { gatewayUrl: '', token: legacyToken, persistence: 'local', source: 'legacy' };
    return { gatewayUrl: '', token: '', persistence: 'none', source: 'empty' };
  }

  function saveConnection(connection) {
    const persistence = connection.persistence === 'session' ? 'session' : connection.persistence === 'none' ? 'none' : 'local';
    clearConnection();
    if (persistence === 'none') return;
    const storage = safeStorage(persistence === 'session' ? global.sessionStorage : global.localStorage);
    if (!storage) return;
    storage.setItem(STORAGE_KEY, JSON.stringify({
      gatewayUrl: normalizeGatewayUrl(connection.gatewayUrl),
      token: connection.token || '',
      persistence
    }));
  }

  function clearConnection() {
    for (const storage of [safeStorage(global.localStorage), safeStorage(global.sessionStorage)]) {
      if (!storage) continue;
      storage.removeItem(STORAGE_KEY);
      storage.removeItem(LEGACY_TOKEN_KEY);
    }
  }

  let connection = readStoredConnection();

  function getConnection() {
    return { ...connection, gatewayUrl: connection.gatewayUrl || '', token: connection.token || '' };
  }

  function setConnection(next) {
    connection = {
      gatewayUrl: normalizeGatewayUrl(next.gatewayUrl),
      token: String(next.token || '').trim(),
      persistence: next.persistence || 'local',
      source: 'runtime'
    };
    saveConnection(connection);
    return getConnection();
  }

  function disconnect() {
    clearConnection();
    connection = { gatewayUrl: '', token: '', persistence: 'none', source: 'empty' };
  }

  function isConnected() {
    return Boolean(connection.gatewayUrl && connection.token);
  }

  function headers(extra) {
    const h = { ...(extra || {}) };
    if (connection.token) h.Authorization = `Bearer ${connection.token}`;
    return h;
  }

  async function request(path, opts = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
    if (!connection.gatewayUrl) throw new Error('Gateway URL is not configured');
    if (!connection.token) throw new Error('Gateway token is not configured');
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), timeoutMs);
    const target = path.startsWith('http') ? path : `${connection.gatewayUrl}${path.startsWith('/') ? '' : '/'}${path}`;
    try {
      const res = await fetch(target, {
        ...opts,
        headers: headers(opts.headers),
        signal: controller.signal
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        const err = new Error(redactToken(`Gateway request failed: ${res.status} ${res.statusText}${body ? ` — ${body.slice(0, 240)}` : ''}`));
        err.status = res.status;
        throw err;
      }
      return res;
    } finally {
      clearTimeout(tid);
    }
  }

  async function validate(candidate, probePaths = ['/api/health', '/healthz', '/status']) {
    const previous = connection;
    connection = {
      gatewayUrl: normalizeGatewayUrl(candidate.gatewayUrl),
      token: String(candidate.token || '').trim(),
      persistence: candidate.persistence || 'local',
      source: 'validation'
    };
    if (!connection.gatewayUrl || !connection.token) {
      connection = previous;
      return { ok: false, code: 'missing_credentials', message: 'Gateway URL and token are required.' };
    }
    const errors = [];
    for (const probe of probePaths) {
      try {
        const res = await request(probe, { method: 'GET' }, 5000);
        let data = null;
        try { data = await res.clone().json(); } catch {}
        return { ok: true, probe, status: res.status, data };
      } catch (error) {
        errors.push(redactToken(error.message || String(error)));
        if (error.status === 401 || error.status === 403) break;
      }
    }
    connection = previous;
    return { ok: false, code: 'validation_failed', message: errors[0] || 'Could not validate gateway connection.', errors };
  }

  global.AgentSpaceGateway = {
    STORAGE_KEY,
    normalizeGatewayUrl,
    redactToken,
    readStoredConnection,
    getConnection,
    setConnection,
    clearConnection,
    disconnect,
    isConnected,
    request,
    validate,
    headers
  };
})(window);
