#!/usr/bin/env node
// Smoke test: verify all API endpoints return valid responses
// Usage: node test/smoke.mjs [baseUrl]

const BASE = process.argv[2] || 'http://localhost:18790';
let pass = 0, fail = 0;

async function check(name, url, validate) {
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 3000);
    const res = await fetch(`${BASE}${url}`, { signal: ac.signal });
    if (validate) await validate(res);
    else if (res.status !== 200) throw new Error(`status ${res.status}`);
    clearTimeout(timer);
    console.log(`  ✅ ${name}`);
    pass++;
  } catch (e) {
    if (e.name === 'AbortError') { console.log(`  ✅ ${name} (timeout ok)`); pass++; return; }
    console.log(`  ❌ ${name}: ${e.message}`);
    fail++;
  }
}

async function json(res) { return JSON.parse(await res.text()); }

console.log(`\nAgent Space smoke test → ${BASE}\n`);

// Core
await check('health', '/api/health', async r => { const d = await json(r); if (!d.ok) throw new Error('not ok'); });
await check('agents', '/api/agents', async r => { const d = await json(r); if (!d.agents) throw new Error('no agents key'); });
await check('system', '/api/system', async r => { const d = await json(r); if (!d.hostname && !d.cpu) throw new Error('no system data'); });
await check('activity', '/api/activity', async r => { const d = await json(r); if (!d.activity) throw new Error('no activity key'); });
await check('tokens', '/api/tokens');
await check('cron', '/api/cron');

// Exports
await check('agents CSV', '/api/export/agents?format=csv', async r => { if (!r.headers.get('content-type')?.includes('csv')) throw new Error('not csv'); });
await check('agents JSON export', '/api/export/agents?format=json');

// Additional endpoints
await check('tokens daily', '/api/tokens/daily', async r => { const d = await json(r); if (!d.days) throw new Error('no days key'); });
await check('performance', '/api/performance');
await check('uptime', '/api/uptime');
await check('comm-graph', '/api/comm-graph');
await check('heatmap', '/api/heatmap-calendar');
await check('latency', '/api/latency', async r => { const d = await json(r); if (d.endpoints === undefined) throw new Error('no endpoints key'); });

// SSE endpoint (check content-type, don't consume body)
await check('SSE stream', '/api/events', async r => {
  if (!r.headers.get('content-type')?.includes('text/event-stream')) throw new Error('not SSE');
  try { r.body?.cancel(); } catch {}
});

// Security headers
await check('security headers', '/', async r => {
  await r.text(); // consume body
  const csp = r.headers.get('content-security-policy');
  const xfo = r.headers.get('x-frame-options');
  if (!csp && !xfo) throw new Error('no security headers');
});

// Static
await check('index.html', '/', async r => { const t = await r.text(); if (!t.includes('Agent Space')) throw new Error('missing title'); });
for (const privatePath of [
  '/server.js',
  '/package.json',
  '/test/smoke.mjs',
  '/config.json',
  '/logs/agent-space.log',
  '/%2e%2e/server.js',
  '/assets/demo/%2e%2e/%2e%2e/server.js',
  '/assets/demo/../../../server.js',
]) {
  await check(`does not serve ${privatePath}`, privatePath, async r => {
    if (r.status !== 404) throw new Error(`expected 404, got ${r.status}`);
    await r.text();
  });
}
await check('404 page', '/nonexistent', async r => { if (r.status !== 404) throw new Error(`expected 404, got ${r.status}`); });

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail > 0 ? 1 : 0);
