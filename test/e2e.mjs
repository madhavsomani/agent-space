#!/usr/bin/env node
// E2E test: validates HTML structure, key UI elements, and client-side JS behavior
// Usage: node test/e2e.mjs [baseUrl]
// Requires: running server (demo or prod)

const BASE = process.argv[2] || 'http://localhost:18790';
let pass = 0, fail = 0;

async function check(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    pass++;
  } catch (e) {
    console.log(`  ❌ ${name}: ${e.message}`);
    fail++;
  }
}

async function fetchText(path) {
  const r = await fetch(`${BASE}${path}`);
  if (r.status !== 200) throw new Error(`status ${r.status}`);
  return r.text();
}

console.log(`\nAgent Space E2E test → ${BASE}\n`);

// --- HTML Structure ---
const html = await fetchText('/');

await check('has viewport meta', () => {
  if (!html.includes('name="viewport"')) throw new Error('missing viewport meta');
});

await check('has theme support', async () => {
  const css = await fetchText('/style.css');
  if (!css.includes('data-theme')) throw new Error('missing data-theme in CSS');
});

await check('has header with logo', () => {
  if (!html.includes('<header')) throw new Error('missing header');
  if (!html.includes('class="logo"')) throw new Error('missing logo');
});

await check('has office tab', () => {
  if (!html.includes('id="tab-office"')) throw new Error('missing office tab');
});

await check('has view toggle buttons', () => {
  if (!html.includes('id="view-grid-btn"')) throw new Error('missing grid button');
  if (!html.includes('id="view-2d-btn"')) throw new Error('missing 2d button');
});

await check('has office map container', () => {
  if (!html.includes('id="office-map"')) throw new Error('missing office map');
});

await check('has agent search', () => {
  if (!html.includes('id="agent-search-input"')) throw new Error('missing search input');
});

await check('has KPI quickstats', () => {
  for (const id of ['qs-tokens', 'qs-memories', 'qs-wrs', 'qs-cost']) {
    if (!html.includes(`id="${id}"`)) throw new Error(`missing ${id}`);
  }
});

await check('has mobile nav', () => {
  if (!html.includes('class="mobile-nav"')) throw new Error('missing mobile nav');
});

await check('has keyboard shortcuts help', () => {
  if (!html.includes('help-overlay')) throw new Error('missing help overlay');
});

await check('has notification center', () => {
  if (!html.includes('notif-center-overlay')) throw new Error('missing notification center');
});

await check('has agent detail overlay', () => {
  if (!html.includes('agent-detail-overlay')) throw new Error('missing agent detail');
});

// --- CSS/JS assets load ---
await check('style.css loads', async () => {
  const r = await fetch(`${BASE}/style.css`);
  if (r.status !== 200) throw new Error(`status ${r.status}`);
  const css = await r.text();
  if (css.length < 1000) throw new Error(`too small: ${css.length}`);
});

await check('app.js loads', async () => {
  const r = await fetch(`${BASE}/app.js`);
  if (r.status !== 200) throw new Error(`status ${r.status}`);
  const js = await r.text();
  if (js.length < 10000) throw new Error(`too small: ${js.length}`);
});

await check('office-view.js loads', async () => {
  const r = await fetch(`${BASE}/office-view.js`);
  if (r.status !== 200) throw new Error(`status ${r.status}`);
});

await check('sprites.js loads', async () => {
  const r = await fetch(`${BASE}/sprites.js`);
  if (r.status !== 200) throw new Error(`status ${r.status}`);
});

// --- Tab structure ---
const tabs = ['office', 'tokens', 'memory', 'queue', 'comm-graph', 'system'];
for (const tab of tabs) {
  await check(`tab-${tab} exists`, () => {
    if (!html.includes(`id="tab-${tab}"`)) throw new Error(`missing tab-${tab}`);
  });
}

// --- Nav buttons for tabs ---
await check('nav has tab buttons', () => {
  if (!html.includes('data-tab="office"')) throw new Error('missing office nav');
  if (!html.includes('data-tab="tokens"')) throw new Error('missing tokens nav');
});

// --- ARIA accessibility ---
await check('search input has placeholder', () => {
  if (!html.includes('placeholder="')) throw new Error('missing search placeholder');
});

await check('has aria labels', () => {
  if (!html.includes('aria-label')) throw new Error('no aria-label found');
});

// --- Security ---
await check('no inline secrets', () => {
  // sk- must be followed by alphanumeric (real API key pattern), not part of CSS id like "disk-breakdown"
  if (/sk-[a-zA-Z0-9]{20,}/.test(html)) throw new Error('found sk- API key pattern');
  if (/ghp_[a-zA-Z0-9]{20,}/.test(html)) throw new Error('found ghp_ token');
  if (html.includes('Bearer ')) throw new Error('found Bearer token');
});

await check('no hardcoded home paths', () => {
  if (html.includes('/Users/') || html.includes('/home/')) throw new Error('found hardcoded path');
});

// --- API response shapes ---
await check('agents API has correct shape', async () => {
  const r = await fetch(`${BASE}/api/agents`);
  const d = await r.json();
  if (!Array.isArray(d.agents)) throw new Error('agents not array');
  if (d.agents.length === 0) throw new Error('no agents');
  const a = d.agents[0];
  if (!a.name || !a.role || !a.status) throw new Error('agent missing fields');
});

await check('activity API has correct shape', async () => {
  const r = await fetch(`${BASE}/api/activity`);
  const d = await r.json();
  if (!Array.isArray(d.activity)) throw new Error('activity not array');
});

await check('health API has version', async () => {
  const r = await fetch(`${BASE}/api/health`);
  const d = await r.json();
  if (!d.version) throw new Error('missing version');
  if (!d.ok) throw new Error('not ok');
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail > 0 ? 1 : 0);
