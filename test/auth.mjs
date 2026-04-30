#!/usr/bin/env node
// Auth regression test: protected API endpoints should require a token when auth is enabled.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_PATH = path.join(ROOT, 'config.json');
const PORT = Number(process.argv[2]) || 19670;
const BASE = `http://127.0.0.1:${PORT}`;
const ADMIN_TOKEN = 'test-admin-token';
const VIEWER_TOKEN = 'test-viewer-token';

const previousConfig = fs.existsSync(CONFIG_PATH) ? fs.readFileSync(CONFIG_PATH) : null;
let child = null;
let pass = 0;
let fail = 0;

function restoreConfig() {
  if (previousConfig) fs.writeFileSync(CONFIG_PATH, previousConfig);
  else {
    try { fs.unlinkSync(CONFIG_PATH); } catch {}
  }
}

function stopServer() {
  if (child && !child.killed) child.kill();
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForServer() {
  const deadline = Date.now() + 6000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch {}
    await sleep(150);
  }
  throw new Error('server did not become ready');
}

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

try {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify({
    auth: {
      enabled: true,
      tokens: {
        [ADMIN_TOKEN]: 'admin',
        [VIEWER_TOKEN]: 'viewer',
      },
    },
    rateLimit: { enabled: false },
  }, null, 2));

  child = spawn(process.execPath, ['server.js', '--demo', '--port', String(PORT)], {
    cwd: ROOT,
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  await waitForServer();

  console.log(`\nAgent Space auth test -> ${BASE}\n`);

  await check('agents rejects missing token', async () => {
    const res = await fetch(`${BASE}/api/agents`);
    if (res.status !== 401) throw new Error(`expected 401, got ${res.status}`);
  });

  await check('health remains public', async () => {
    const res = await fetch(`${BASE}/api/health`);
    if (res.status !== 200) throw new Error(`expected 200, got ${res.status}`);
  });

  await check('agents accepts bearer token', async () => {
    const res = await fetch(`${BASE}/api/agents`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    if (res.status !== 200) throw new Error(`expected 200, got ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data.agents)) throw new Error('missing agents array');
  });

  await check('viewer role rejects write requests', async () => {
    const res = await fetch(`${BASE}/api/queue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': VIEWER_TOKEN,
      },
      body: JSON.stringify({ title: 'Auth regression test' }),
    });
    if (res.status !== 403) throw new Error(`expected 403, got ${res.status}`);
  });

  await check('query token works after other params', async () => {
    const res = await fetch(`${BASE}/api/export/agents?format=json&token=${encodeURIComponent(ADMIN_TOKEN)}`);
    if (res.status !== 200) throw new Error(`expected 200, got ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data.agents)) throw new Error('missing agents array');
  });

  await check('SSE rejects missing token', async () => {
    const res = await fetch(`${BASE}/api/events`);
    if (res.status !== 401) throw new Error(`expected 401, got ${res.status}`);
  });

  await check('SSE accepts token query param', async () => {
    const res = await fetch(`${BASE}/api/events?token=${encodeURIComponent(ADMIN_TOKEN)}`);
    if (res.status !== 200) throw new Error(`expected 200, got ${res.status}`);
    if (!res.headers.get('content-type')?.includes('text/event-stream')) throw new Error('not SSE');
    try { await res.body?.cancel(); } catch {}
  });
} finally {
  stopServer();
  restoreConfig();
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail > 0 ? 1 : 0);
