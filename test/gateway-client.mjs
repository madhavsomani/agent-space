#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function makeStorage() {
  const map = new Map();
  return {
    getItem: (k) => map.has(k) ? map.get(k) : null,
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k)
  };
}

const context = {
  window: {
    location: { search: '' },
    localStorage: makeStorage(),
    sessionStorage: makeStorage(),
    fetch: async () => ({ ok: true, status: 200, clone() { return this; }, json: async () => ({ ok: true }) }),
    setTimeout,
    clearTimeout,
    URL,
    URLSearchParams
  },
  URL,
  URLSearchParams,
  setTimeout,
  clearTimeout
};
context.window.window = context.window;
context.fetch = context.window.fetch;
vm.createContext(context);
vm.runInContext(fs.readFileSync(new URL('../gateway-client.js', import.meta.url), 'utf8'), context);

const gw = context.window.AgentSpaceGateway;
assert.equal(gw.normalizeGatewayUrl('127.0.0.1:18789/'), 'http://127.0.0.1:18789');
assert.equal(gw.normalizeGatewayUrl('https://example.com///'), 'https://example.com');
assert.equal(gw.redactToken('Authorization: Bearer fake-test-token'), 'Authorization: Bearer [redacted]');
assert.equal(gw.redactToken('https://x.test/?token=abc123'), 'https://x.test/?token=[redacted]');

gw.setConnection({ gatewayUrl: 'localhost:18789/', token: 'fake-test-token', persistence: 'session' });
assert.equal(gw.getConnection().gatewayUrl, 'http://localhost:18789');
assert.equal(gw.headers().Authorization, 'Bearer fake-test-token');

gw.disconnect();
assert.equal(gw.isConnected(), false);
console.log('gateway client tests passed');
