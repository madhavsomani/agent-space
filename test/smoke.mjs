#!/usr/bin/env node
// Smoke test: verify all API endpoints return valid responses
// Usage: node test/smoke.mjs [baseUrl]

const BASE = process.argv[2] || 'http://localhost:18790';
let pass = 0, fail = 0;

async function check(name, url, validate) {
  try {
    const res = await fetch(`${BASE}${url}`);
    const body = await res.text();
    let data;
    try { data = JSON.parse(body); } catch { data = body; }
    if (validate) validate(res, data);
    else if (res.status !== 200) throw new Error(`status ${res.status}`);
    console.log(`  ✅ ${name}`);
    pass++;
  } catch (e) {
    console.log(`  ❌ ${name}: ${e.message}`);
    fail++;
  }
}

console.log(`\nAgent Space smoke test → ${BASE}\n`);

// Core
await check('health', '/api/health', (r, d) => { if (!d.ok) throw new Error('not ok'); });
await check('agents', '/api/agents', (r, d) => { if (!d.agents) throw new Error('no agents key'); });
await check('system', '/api/system', (r, d) => { if (!d.hostname && !d.cpu) throw new Error('no system data'); });
await check('activity', '/api/activity', (r, d) => { if (!d.activity) throw new Error('no activity key'); });
await check('tokens', '/api/tokens');
await check('cron', '/api/cron');

// Exports
await check('agents CSV', '/api/export/agents?format=csv', (r) => { if (!r.headers.get('content-type')?.includes('csv')) throw new Error('not csv'); });
await check('agents JSON export', '/api/export/agents?format=json');

// Static files
await check('index.html', '/', (r, d) => { if (!d.includes('Agent Space')) throw new Error('missing title'); });
await check('404 page', '/nonexistent', (r) => { if (r.status !== 404) throw new Error(`expected 404, got ${r.status}`); });

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail > 0 ? 1 : 0);
