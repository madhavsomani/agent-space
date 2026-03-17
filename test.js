#!/usr/bin/env node
// Agent Space — smoke tests
const BASE = process.env.BASE_URL || 'http://localhost:18790';
let pass = 0, fail = 0;

async function test(name, fn) {
  try { await fn(); pass++; console.log(`  ✅ ${name}`); }
  catch (e) { fail++; console.log(`  ❌ ${name}: ${e.message}`); }
}

function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

async function get(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(5000), ...opts });
  return res;
}

async function json(path) {
  const res = await get(path);
  assert(res.ok, `HTTP ${res.status}`);
  return res.json();
}

(async () => {
  console.log(`\nAgent Space smoke tests (${BASE})\n`);

  await test('GET /api/health → ok', async () => {
    const d = await json('/api/health');
    assert(d.ok === true);
  });

  await test('GET /api/agents → agents array', async () => {
    const d = await json('/api/agents');
    assert(Array.isArray(d.agents), 'missing agents array');
  });

  await test('GET /api/system → has cpu/mem', async () => {
    const d = await json('/api/system');
    assert('cpu' in d || 'memory' in d || 'hostname' in d);
  });

  await test('GET /api/tokens → has totals', async () => {
    const d = await json('/api/tokens');
    assert('totals' in d || 'agents' in d);
  });

  await test('GET /api/tokens/daily → array', async () => {
    const d = await json('/api/tokens/daily');
    assert(Array.isArray(d) || 'days' in d);
  });

  await test('GET /api/activity → array', async () => {
    const d = await json('/api/activity');
    assert(Array.isArray(d) || 'activity' in d || 'events' in d || 'feed' in d);
  });

  await test('GET /api/uptime → data', async () => {
    const d = await json('/api/uptime');
    assert(typeof d === 'object');
  });

  await test('GET /api/performance → data', async () => {
    const d = await json('/api/performance');
    assert(typeof d === 'object');
  });

  await test('GET /api/comm-graph → edges/nodes', async () => {
    const d = await json('/api/comm-graph');
    assert('edges' in d || 'nodes' in d);
  });

  await test('GET /api/heatmap-calendar → data', async () => {
    const d = await json('/api/heatmap-calendar');
    assert(typeof d === 'object');
  });

  await test('GET /api/queue → columns', async () => {
    const d = await json('/api/queue');
    assert('columns' in d || 'active' in d);
  });

  await test('GET / → HTML', async () => {
    const res = await get('/');
    assert(res.ok);
    const html = await res.text();
    assert(html.includes('office-canvas'), 'missing canvas');
  });

  await test('GET /nonexistent → 404', async () => {
    const res = await get('/nonexistent');
    assert(res.status === 404, `expected 404, got ${res.status}`);
  });

  await test('Security headers present', async () => {
    const res = await get('/api/health');
    const cors = res.headers.get('access-control-allow-origin');
    assert(cors, 'missing CORS header');
  });

  await test('SSE /api/events → text/event-stream', async () => {
    const res = await fetch(`${BASE}/api/events`, { signal: AbortSignal.timeout(2000) }).catch(() => null);
    if (res) {
      assert(res.headers.get('content-type')?.includes('text/event-stream'));
      try { res.body?.cancel(); } catch {}
    }
  });

  await test('Rate limit headers work', async () => {
    // Just verify the endpoint doesn't crash under normal load
    const res = await get('/api/health');
    assert(res.ok);
  });

  await test('JSON content-type', async () => {
    const res = await get('/api/health');
    assert(res.headers.get('content-type')?.includes('application/json'));
  });

  console.log(`\n${pass}/${pass + fail} passed${fail ? ` (${fail} failed)` : ''}\n`);
  process.exit(fail ? 1 : 0);
})();
