const http = require('http');
const fs = require('fs');
const path = require('path');

// Global error handling — keep server alive
process.on('uncaughtException', (err) => { console.error('Uncaught exception:', err.message); });
process.on('unhandledRejection', (err) => { console.error('Unhandled rejection:', err); });
const { execSync, exec: execAsync } = require('child_process');

const DEMO_MODE = process.argv.includes('--demo');
const WR_DIR = path.join(__dirname, '..', 'work_requests');

// ===== PERSISTENT STORAGE (node:sqlite, zero deps) =====
const sqlite = require('node:sqlite');
const DB_PATH = path.join(__dirname, 'agent-space.db');
const db = new sqlite.DatabaseSync(DEMO_MODE ? ':memory:' : DB_PATH);

// Schema
db.exec(`
  CREATE TABLE IF NOT EXISTS token_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER NOT NULL,
    date TEXT NOT NULL,
    agent TEXT NOT NULL,
    model TEXT DEFAULT '',
    input INTEGER DEFAULT 0,
    output INTEGER DEFAULT 0,
    cache_read INTEGER DEFAULT 0,
    cache_write INTEGER DEFAULT 0,
    cost REAL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS cost_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER NOT NULL,
    date TEXT NOT NULL,
    total_cost REAL DEFAULT 0,
    total_tokens INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS agent_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER NOT NULL,
    agent TEXT NOT NULL,
    event TEXT NOT NULL,
    detail TEXT DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER NOT NULL,
    key TEXT NOT NULL,
    value REAL NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_token_date ON token_snapshots(date);
  CREATE INDEX IF NOT EXISTS idx_cost_date ON cost_history(date);
  CREATE INDEX IF NOT EXISTS idx_agent_events_ts ON agent_events(ts);
  CREATE INDEX IF NOT EXISTS idx_metrics_key_ts ON metrics(key, ts);
`);

// Prepared statements for hot paths
const _stmts = {
  insertTokenSnap: db.prepare('INSERT INTO token_snapshots(ts, date, agent, model, input, output, cache_read, cache_write, cost) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)'),
  insertCostSnap: db.prepare('INSERT INTO cost_history(ts, date, total_cost, total_tokens) VALUES(?, ?, ?, ?)'),
  insertEvent: db.prepare('INSERT INTO agent_events(ts, agent, event, detail) VALUES(?, ?, ?, ?)'),
  insertMetric: db.prepare('INSERT INTO metrics(ts, key, value) VALUES(?, ?, ?)'),
  getCostHistory: db.prepare('SELECT date, total_cost, total_tokens FROM cost_history WHERE date >= ? ORDER BY date ASC'),
  getTokensByDate: db.prepare('SELECT agent, SUM(input) as input, SUM(output) as output, SUM(cache_read) as cache_read, SUM(cost) as cost FROM token_snapshots WHERE date = ? GROUP BY agent'),
  getRecentEvents: db.prepare('SELECT ts, agent, event, detail FROM agent_events WHERE ts > ? ORDER BY ts DESC LIMIT 100'),
  getMetrics: db.prepare('SELECT ts, value FROM metrics WHERE key = ? AND ts > ? ORDER BY ts ASC'),
  getLastCostSnap: db.prepare('SELECT date FROM cost_history ORDER BY ts DESC LIMIT 1'),
};

// Snapshot function: called periodically to persist current state
function persistSnapshot() {
  try {
    const now = Date.now();
    const today = new Date().toISOString().slice(0, 10);
    
    // Check if we already have a snapshot for today
    const lastSnap = _stmts.getLastCostSnap.get();
    if (lastSnap && lastSnap.date === today) return; // already snapped today

    const tokenData = typeof getTokens === 'function' ? getTokens() : null;
    if (!tokenData) return;
    
    // byAgent is a dict { agentId: { input, output, cached, ... } }
    const byAgent = tokenData.byAgent || {};
    const agentEntries = Object.entries(byAgent);
    if (!agentEntries.length) return;

    // Token snapshots per agent
    for (const [agentId, a] of agentEntries) {
      _stmts.insertTokenSnap.run(now, today, agentId, '', a.input || 0, a.output || 0, a.cached || 0, 0, 0);
    }

    // Cost snapshot
    const totalCost = parseFloat(tokenData.estimatedCostUSD) || 0;
    const totalTokens = tokenData.totals?.total || 0;
    _stmts.insertCostSnap.run(now, today, totalCost, totalTokens);

    console.log(`[db] Persisted snapshot for ${today}`);
  } catch (e) { console.error('[db] Snapshot error:', e.message); }
}

// Record agent status changes
function recordAgentEvent(agentName, event, detail = '') {
  try { _stmts.insertEvent.run(Date.now(), agentName, event, detail); } catch {}
}

// Record a metric data point
function recordMetric(key, value) {
  try { _stmts.insertMetric.run(Date.now(), key, value); } catch {}
}
const HOME = process.env.HOME || require('os').homedir();
const AGENTS_DIR = path.join(HOME, '.openclaw', 'agents');
const QUEUE_FILE = path.join(WR_DIR, '_ACTIVE_QUEUE.md');

if (DEMO_MODE) console.log('🎮 Running in DEMO mode — serving mock data');

// ===== DEMO MODE DATA =====
const DEMO_AGENTS = [
  { name: 'Atlas', role: 'CEO', color: '#FFD700', status: 'working', sessionDir: 'atlas', lastActivity: 'Reviewing quarterly goals', activityAge: 120000 },
  { name: 'Nova', role: 'Content Director', color: '#FF6B6B', status: 'working', sessionDir: 'nova', lastActivity: 'Planning blog series on AI agents', activityAge: 300000 },
  { name: 'Sage', role: 'Writer', color: '#4ECDC4', status: 'idle', sessionDir: 'sage', lastActivity: 'Finished draft: "Building Your First Agent"', activityAge: 900000 },
  { name: 'Pixel', role: 'Designer', color: '#A78BFA', status: 'idle', sessionDir: 'pixel', lastActivity: 'Created hero image for landing page', activityAge: 600000 },
  { name: 'Forge', role: 'Backend Engineer', color: '#00D4FF', status: 'working', sessionDir: 'forge', lastActivity: 'Implementing WebSocket reconnection logic', activityAge: 45000 },
  { name: 'Circuit', role: 'Frontend Engineer', color: '#00BFFF', status: 'working', sessionDir: 'circuit', lastActivity: 'Refactoring dashboard components', activityAge: 180000 },
  { name: 'Herald', role: 'Email Ops', color: '#FF69B4', status: 'sleeping', sessionDir: 'herald', lastActivity: 'Processed 12 inbox items', activityAge: 3600000 },
  { name: 'Sentinel', role: 'QA Agent', color: '#EF4444', status: 'idle', sessionDir: 'sentinel', lastActivity: 'All tests passing ✅', activityAge: 1200000 },
];

function demoAgents() {
  // Rotate statuses slightly based on time for liveness
  const now = Date.now();
  const phase = Math.floor(now / 30000) % 8;
  return { agents: DEMO_AGENTS.map((a, i) => {
    let status = a.status;
    if (i === phase % DEMO_AGENTS.length) status = ['working','idle','working'][Math.floor(now/10000) % 3];
    return { ...a, status, lastActivityTs: now - a.activityAge + Math.sin(now/5000)*30000, persistent: i < 6 };
  })};
}

function demoSystem() {
  const now = Date.now();
  const cpuJitter = 8 + Math.sin(now/7000)*5 + Math.random()*3;
  return {
    cpu: { usage: Math.round(cpuJitter*10)/10, cores: 8, model: 'Apple M2', speed: '3.49 GHz' },
    memory: { usedPercent: 42 + Math.sin(now/12000)*5, total: '16.00 GB', used: `${(6.7+Math.sin(now/12000)*0.8).toFixed(2)} GB`, free: `${(9.3-Math.sin(now/12000)*0.8).toFixed(2)} GB` },
    disk: { usedPercent: 61, total: '460 GB', used: '281 GB', free: '179 GB' },
    uptime: '4d 12h 33m',
    services: [
      { name: 'OpenClaw Gateway', status: 'running', uptime: '4d 12h' },
      { name: 'Agent Space', status: 'running', uptime: '2d 8h' },
      { name: 'Qdrant', status: 'running', uptime: '4d 12h' },
    ],
    battery: { percent: 87, charging: true, timeRemaining: '~3h 20m' },
    network: { bytesSent: 1240000000, bytesRecv: 3890000000, connections: 42 },
  };
}

function demoTokens() {
  return { totalInput: 2847312, totalOutput: 891204, totalCached: 1203488, models: { 'claude-sonnet-4-20250514': { input: 1800000, output: 520000, cached: 900000 }, 'gpt-4o': { input: 600000, output: 200000, cached: 200000 }, 'gemini-2.5-pro': { input: 447312, output: 171204, cached: 103488 } }, estimatedCost: '$4.82' };
}

function demoActivity() {
  const now = Date.now();
  const events = [];
  const actions = [
    { agent: 'Forge', msg: 'Committed: fix WebSocket reconnection', type: 'commit' },
    { agent: 'Nova', msg: 'Created WR: Blog post outline', type: 'wr' },
    { agent: 'Atlas', msg: 'Reviewed and approved PR #42', type: 'agent' },
    { agent: 'Circuit', msg: 'Deployed dashboard v2.1', type: 'system' },
    { agent: 'Sage', msg: 'Finished article draft (2,400 words)', type: 'agent' },
    { agent: 'Sentinel', msg: 'Ran test suite — 47/47 passed', type: 'agent' },
    { agent: 'Herald', msg: 'Processed 12 emails, flagged 2 urgent', type: 'agent' },
    { agent: 'Pixel', msg: 'Exported 4 social media assets', type: 'agent' },
    { agent: 'Forge', msg: 'Merged branch: feature/api-cache', type: 'commit' },
    { agent: 'Nova', msg: 'Updated content calendar for Q2', type: 'wr' },
  ];
  for (let i = 0; i < actions.length; i++) {
    events.push({ ...actions[i], ts: now - i * 900000 + Math.random()*60000, time: new Date(now - i*900000).toISOString() });
  }
  return { events };
}

function demoQueue() {
  return { columns: { created: [{ title: 'API rate limit docs', type: 'task', priority: 'medium', owner: '' }], active: [{ title: 'WebSocket reconnection', type: 'bug', priority: 'high', owner: 'Forge' }, { title: 'Blog: Building Agents', type: 'content', priority: 'medium', owner: 'Sage' }], review: [{ title: 'Dashboard dark mode', type: 'feature', priority: 'low', owner: 'Circuit' }], done: [{ title: 'Fix login redirect', type: 'bug', priority: 'high', owner: 'Forge' }, { title: 'Email digest template', type: 'task', priority: 'medium', owner: 'Herald' }] } };
}

function demoMemory() {
  return { totalPoints: 1847, collections: [{ name: 'atlas', points: 312 }, { name: 'nova', points: 287 }, { name: 'sage', points: 401 }, { name: 'forge', points: 523 }, { name: 'circuit', points: 182 }, { name: 'herald', points: 142 }], files: [{ agent: 'forge', file: 'state.md', sizeKB: 4.2 }, { agent: 'sage', file: 'state.md', sizeKB: 3.8 }, { agent: 'nova', file: 'state.md', sizeKB: 2.9 }] };
}

function demoPerformance() {
  const agents = {};
  DEMO_AGENTS.filter(a => a.status !== 'sleeping').forEach(a => {
    agents[a.sessionDir] = { name: a.name, runs: 24 + Math.floor(Math.random()*20), successes: 22 + Math.floor(Math.random()*18), failures: Math.floor(Math.random()*3), avgDurationMs: 15000 + Math.random()*30000 };
  });
  return { agents, overall: { totalRuns: 180, successRate: 94.2, avgDuration: '22s' } };
}

function demoHealthScore() {
  return { score: 92, components: { cpu: 95, memory: 88, disk: 90, services: 96 }, grade: 'A' };
}

function demoUptime() {
  const agents = {};
  DEMO_AGENTS.forEach(a => { agents[a.name] = { uptimePercent: 70 + Math.random()*28, activeMinutes: 800 + Math.floor(Math.random()*600) }; });
  return { agents };
}

function demoTimeline() {
  // 6-hour timeline with 15-min buckets = 24 buckets per agent
  const now = Date.now();
  const buckets = 24;
  const bucketMs = 15 * 60 * 1000;
  const events = [];
  DEMO_AGENTS.forEach(a => {
    for (let b = 0; b < buckets; b++) {
      const ts = now - (buckets - b) * bucketMs;
      // Simulate realistic activity patterns
      const hourOfDay = new Date(ts).getHours();
      const isActive = a.status === 'sleeping' ? (Math.random() < 0.15) :
        a.status === 'working' ? (Math.random() < 0.85) : (Math.random() < 0.5);
      if (isActive) {
        events.push({ agent: a.name, ts, time: new Date(ts).toISOString(), msg: `${a.name} active`, type: 'agent' });
      }
    }
  });
  return { events };
}
function demoHeatmap() {
  // GitHub-style 90-day calendar heatmap per agent
  const now = Date.now();
  const days = 90;
  const agents = {};
  DEMO_AGENTS.forEach(a => {
    const data = {};
    // Use agent name as seed for consistent patterns
    const seed = a.name.charCodeAt(0) * 137 + a.name.length * 53;
    for (let d = 0; d < days; d++) {
      const date = new Date(now - (days - d) * 86400000);
      const key = date.toISOString().split('T')[0];
      const dow = date.getDay();
      // Weekend dip, sleeping agents have sparse activity
      const weekendFactor = (dow === 0 || dow === 6) ? 0.3 : 1.0;
      const statusFactor = a.status === 'sleeping' ? 0.2 : a.status === 'idle' ? 0.6 : 1.0;
      const noise = Math.sin(seed + d * 0.7) * 0.3 + Math.sin(seed * 3 + d * 0.3) * 0.2;
      const base = 0.5 + noise;
      const count = Math.max(0, Math.round(base * weekendFactor * statusFactor * 15));
      data[key] = count;
    }
    agents[a.name] = { color: a.color, data };
  });
  return { agents };
}
function demoCommGraph() { return { edges: [{ from: 'Atlas', to: 'Nova', weight: 12 }, { from: 'Nova', to: 'Sage', weight: 8 }, { from: 'Forge', to: 'Circuit', weight: 15 }, { from: 'Atlas', to: 'Forge', weight: 6 }, { from: 'Sentinel', to: 'Forge', weight: 9 }], nodes: DEMO_AGENTS.map(a => ({ name: a.name, color: a.color })) }; }
function demoDepGraph() { return { nodes: DEMO_AGENTS.map(a => ({ name: a.name, color: a.color, parent: a.name === 'Atlas' ? null : 'Atlas' })) }; }
function demoLiveLogs() {
  const now = Date.now();
  const logs = [];
  const entries = [
    { agent: 'Forge', role: 'assistant', text: 'Implementing retry logic for WebSocket connections with exponential backoff...' },
    { agent: 'Circuit', role: 'assistant', text: 'Refactored 3 dashboard components to use shared state management' },
    { agent: 'Atlas', role: 'user', text: 'Can you review PR #42 and check for edge cases in the auth flow?' },
    { agent: 'Atlas', role: 'assistant', text: 'Reviewing PR #42 now. Found 2 minor issues in token refresh logic, commenting inline.' },
    { agent: 'Nova', role: 'assistant', text: 'Drafted outline for "Building Your First Agent" — 8 sections, ~3000 words target' },
    { agent: 'Sage', role: 'assistant', text: 'Finished writing section 3: Agent Memory & Context. Word count: 2,412.' },
    { agent: 'Sentinel', role: 'assistant', text: 'Test suite complete: 47/47 passing. Coverage at 89.2%.' },
    { agent: 'Pixel', role: 'assistant', text: 'Generated 4 social cards with brand colors. Exported as PNG + SVG.' },
  ];
  for (let i = 0; i < entries.length; i++) {
    logs.push({ ...entries[i], ts: now - i * 180000, time: new Date(now - i * 180000).toISOString() });
  }
  return { logs };
}
function demoTokensDaily() { const days = []; for(let i=13;i>=0;i--){ const d = new Date(Date.now()-i*86400000); days.push({date:d.toISOString().split('T')[0], input:150000+Math.random()*100000, output:50000+Math.random()*40000, cached:80000+Math.random()*60000}); } return {days}; }
function demoDiskBreakdown() { return { entries: [{path:'~/.openclaw',size:'1.2 GB'},{path:'~/projects',size:'4.8 GB'},{path:'/tmp',size:'320 MB'}] }; }
function demoCompletionStats() { return { completed: 42, inProgress: 3, total: 48, rate: 87.5 }; }
function demoCalendar() { return { events: [] }; }
function demoCron() { return { jobs: [] }; }
function demoWeather() { return { condition: 'clear', tempF: 72, desc: 'Sunny', icon: '☀️' }; }
function demoProcesses() { return { processes: [{user:'agent',pid:'1234',cpu:'2.1',mem:'1.8',command:'node server.js'},{user:'agent',pid:'5678',cpu:'0.5',mem:'0.3',command:'openclaw gateway'}] }; }
function demoMemoryHistory() { const pts = []; for(let i=29;i>=0;i--) pts.push({ts:Date.now()-i*3600000, total:1200+i*20+Math.random()*50}); return {history:pts}; }

const DEMO_HANDLERS = {
  '/api/health': () => ({ok:true}),
  '/api/health-score': demoHealthScore,
  '/api/system': demoSystem,
  '/api/processes': demoProcesses,
  '/api/agents': demoAgents,
  '/api/memory': demoMemory,
  '/api/memory/history': demoMemoryHistory,
  '/api/tokens': demoTokens,
  '/api/tokens/daily': demoTokensDaily,
  '/api/calendar': demoCalendar,
  '/api/cron': demoCron,
  '/api/disk-breakdown': demoDiskBreakdown,
  '/api/performance': demoPerformance,
  '/api/completion-stats': demoCompletionStats,
  '/api/uptime': demoUptime,
  '/api/queue': demoQueue,
  '/api/activity': demoActivity,
  '/api/timeline': demoTimeline,
  '/api/timeline-heatmap': demoHeatmap,
  '/api/comm-graph': demoCommGraph,
  '/api/dependency-graph': demoDepGraph,
  '/api/heatmap-calendar': demoHeatmap,
  '/api/live-logs': demoLiveLogs,
  '/api/weather': demoWeather,
};

// Crash handler
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});
process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});

function json(res, data) {
  res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
  res.end(JSON.stringify(data));
}

// Agent metadata: loaded from config.json (user-customizable) or auto-discovered
// See config.example.json for customization options
const CONFIG_FILE = path.join(__dirname, 'config.json');
let USER_CONFIG = {};
try { if (fs.existsSync(CONFIG_FILE)) USER_CONFIG = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch {}

// Build KNOWN_AGENTS from config file
const KNOWN_AGENTS = {};
if (USER_CONFIG.agents) {
  for (const [key, val] of Object.entries(USER_CONFIG.agents)) {
    KNOWN_AGENTS[key] = { ...val };
  }
}

// Auto-generate colors for unknown agents
const DEFAULT_COLORS = ['#F59E0B','#8B5CF6','#EC4899','#06B6D4','#84CC16','#F43F5E','#14B8A6','#D946EF','#FB923C','#22D3EE'];
let _colorIdx = 0;

// Dynamically discover agents from filesystem + merge with known metadata
// Cache discovery for 30s
let _discoveredAgents = null;
let _discoveryTime = 0;
const DISCOVERY_TTL = 30000;

function discoverAgents() {
  const now = Date.now();
  if (_discoveredAgents && (now - _discoveryTime) < DISCOVERY_TTL) return _discoveredAgents;

  const agents = [];
  const seen = new Set();

  try {
    const dirs = fs.readdirSync(AGENTS_DIR).filter(d => {
      try { return fs.statSync(path.join(AGENTS_DIR, d)).isDirectory(); } catch { return false; }
    });

    for (const dir of dirs) {
      // Skip dirs that have no sessions/ or memory/ (not real agents)
      const hasSession = fs.existsSync(path.join(AGENTS_DIR, dir, 'sessions'));
      const hasMemory = fs.existsSync(path.join(AGENTS_DIR, dir, 'memory'));
      if (!hasSession && !hasMemory) continue;

      // Skip discovered agents with no real session files (empty dirs, model aliases, etc.)
      const known = KNOWN_AGENTS[dir];
      if (!known) {
        let hasJsonl = false;
        if (hasSession) {
          try { hasJsonl = fs.readdirSync(path.join(AGENTS_DIR, dir, 'sessions')).some(f => f.endsWith('.jsonl')); } catch {}
        }
        let hasState = false;
        if (hasMemory) {
          try { hasState = fs.existsSync(path.join(AGENTS_DIR, dir, 'memory', 'state.md')); } catch {}
        }
        if (!hasJsonl && !hasState) continue; // Skip empty/orphan agent dirs
      }

      const displayName = known?.name || dir.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      const color = known?.color || DEFAULT_COLORS[_colorIdx++ % DEFAULT_COLORS.length];

      agents.push({
        name: displayName,
        role: known?.role || 'Agent',
        color,
        sessionDir: dir,
        sessionKey: known?.sessionKey || `agent:${dir}:main`,
        transcriptId: known?.transcriptId,
        cronJobId: known?.cronJobId,
        persistent: known?.persistent,
        discovered: !known, // flag for dynamically found agents
      });
      seen.add(dir);
    }
  } catch (e) { console.error('Agent discovery error:', e.message); }

  // Ensure all known agents are included even if dir doesn't exist yet
  for (const [dir, meta] of Object.entries(KNOWN_AGENTS)) {
    if (!seen.has(dir)) {
      agents.push({ ...meta, sessionDir: dir, discovered: false });
    }
  }

  _discoveredAgents = agents;
  _discoveryTime = now;
  return agents;
}

// Backward-compatible: AGENT_MAP is now a getter
Object.defineProperty(global, 'AGENT_MAP', { get: () => discoverAgents() });
const AGENT_MAP = { get list() { return discoverAgents(); } };

// Cache for cron run data — serialized queue to avoid spawning many CLI processes at once
let _cronCache = {};  // jobId -> { ts, data }
const CRON_CACHE_TTL = 600000; // 10 min — cron data refreshed by background warmer only

function getCronAgentActivity(cronJobId) {
  // Previously spawned openclaw cron runs subprocess — too expensive, starves event loop.
  // Now returns cached data only; cache is populated by background warmup (never blocks).
  const cached = _cronCache[cronJobId];
  return cached ? cached.data : null;
}

// Background cron cache warmer — runs ONCE on startup then every 10 min.
// Never blocks the event loop since it uses execAsync with strict timeout.
let _cronWarmRunning = false;
function _warmCronCacheOnce() {
  if (_cronWarmRunning) return;
  const agents = discoverAgents().filter(a => a.cronJobId);
  if (!agents.length) return;
  _cronWarmRunning = true;
  let idx = 0;
  function next() {
    if (idx >= agents.length) { _cronWarmRunning = false; return; }
    const a = agents[idx++];
    execAsync(
      `openclaw cron runs --id ${a.cronJobId} --limit 1 --timeout 3000 2>&1`,
      { timeout: 5000, encoding: 'utf8' },
      (err, stdout) => {
        if (!err && stdout) {
          try {
            const lines = stdout.split('\n');
            let jsonStr = '', braceDepth = 0, collecting = false;
            for (const line of lines) {
              if (!collecting && line.trim().startsWith('{')) collecting = true;
              if (collecting) {
                jsonStr += line + '\n';
                for (const ch of line) { if (ch === '{') braceDepth++; if (ch === '}') braceDepth--; }
                if (braceDepth === 0 && jsonStr.trim()) break;
              }
            }
            if (jsonStr.trim()) {
              const parsed = JSON.parse(jsonStr);
              const entries = parsed.entries || [];
              if (entries.length) {
                const latest = entries[0];
                const finishedTs = latest.ts || 0;
                const startedTs = latest.runAtMs || 0;
                const isRunning = latest.action === 'started' || (!latest.status && latest.action !== 'finished');
                const summary = (latest.summary || '').replace(/[^\x20-\x7E\n]/g, '').slice(0, 200);
                const summaryLines = summary.split('\n').map(l => l.replace(/\*+/g, '').replace(/^#+\s*/, '').replace(/[✅❌🔧📬]/g, '').trim()).filter(l => l.length > 10);
                const junkRe = /^(ANNOUNCE_SKIP|NO_REPLY|Agent (Summary|Session\s*Complete)|Should go to|Current time:)/i;
                let lastMessage = (summaryLines.find(l => !junkRe.test(l) && !/^(Shipped|Next priority):?\s*$/i.test(l)) || '').slice(0, 200);
                _cronCache[a.cronJobId] = { ts: Date.now(), data: { lastActivity: finishedTs || startedTs, lastMessage, isRunning, status: latest.status, durationMs: latest.durationMs, nextRunAtMs: latest.nextRunAtMs } };
              } else {
                _cronCache[a.cronJobId] = { ts: Date.now(), data: null };
              }
            }
          } catch {}
        }
        // Next agent after 3s breathing room
        setTimeout(next, 3000);
      }
    );
  }
  next();
}

function getLastSessionActivity(agentDir, sessionKey, transcriptId) {
  const sessDir = path.join(AGENTS_DIR, agentDir, 'sessions');
  if (!fs.existsSync(sessDir)) return null;

  let bestFile = null, bestMtime = 0;
  const ONE_HOUR = 3600000;
  const now = Date.now();

  // Only scan files modified in the last hour (avoids stat'ing hundreds of old files)
  try {
    const files = fs.readdirSync(sessDir).filter(f => f.endsWith('.jsonl') && !f.endsWith('.lock') && !f.startsWith('sessions'));
    for (const f of files) {
      try {
        const fp = path.join(sessDir, f);
        const mt = fs.statSync(fp).mtimeMs;
        if ((now - mt) > ONE_HOUR) continue; // skip old files
        if (mt > bestMtime) { bestMtime = mt; bestFile = fp; }
      } catch {}
    }
  } catch { return null; }

  if (!bestFile) return null;

  // Read last chunk of file for context (avoid loading multi-MB files)
  let lastMessage = '';
  let lastTimestamp = bestMtime;
  try {
    const stat = fs.statSync(bestFile);
    const readSize = Math.min(stat.size, 50000); // last 50KB — enough for recent messages
    const fd = fs.openSync(bestFile, 'r');
    const buf = Buffer.alloc(readSize);
    fs.readSync(fd, buf, 0, readSize, Math.max(0, stat.size - readSize));
    fs.closeSync(fd);
    const content = buf.toString('utf8');
    const lines = content.trim().split('\n').filter(l => l.trim());
    for (let i = lines.length - 1; i >= Math.max(0, lines.length - 30); i--) {
      try {
        const entry = JSON.parse(lines[i]);
        // Handle both formats: direct {role,content} and {type:"message", message:{role,content}}
        const msg = entry.message || entry;
        if (msg.role === 'assistant' && msg.content) {
          const contents = Array.isArray(msg.content) ? msg.content : [msg.content];
          for (const c of contents) {
            const txt = typeof c === 'string' ? c : (c.type === 'text' && c.text ? c.text : '');
            if (txt && txt.trim()) {
              const cleaned = txt.trim().replace(/[^\x20-\x7E]/g, '').slice(0, 120);
              if (!/^(ANNOUNCE_SKIP|NO_REPLY|Agent Summary:?|Agent\s+Session Complete)$/i.test(cleaned) && cleaned.length >= 5) {
                lastMessage = cleaned;
              }
              break;
            }
          }
          if (entry.timestamp) {
            const ts = typeof entry.timestamp === 'string' ? new Date(entry.timestamp).getTime() : entry.timestamp;
            if (ts > lastTimestamp) lastTimestamp = ts;
          }
          if (lastMessage) break;
        }
      } catch {}
    }
  } catch {}

  return { lastActivity: lastTimestamp, lastMessage };
}

let _agentsCache = null, _agentsCacheTime = 0;
const AGENTS_CACHE_TTL = 60000; // 60s — agents endpoint scans session files + triggers cron cache
function getAgents() {
  const now = Date.now();
  if (_agentsCache && (now - _agentsCacheTime) < AGENTS_CACHE_TTL) return _agentsCache;
  const ACTIVE_THRESHOLD = 10 * 60 * 1000; // 10 minutes — cron agents run every 5m, so 10m window catches active ones

  const agents = discoverAgents().map(a => {
    let lastActivity = 0, lastMessage = '', extraInfo = {};

    // Cron agents: use cron run history (source of truth for isolated workers)
    // Non-cron agents: use JSONL file scan
    if (a.cronJobId) {
      const cronData = getCronAgentActivity(a.cronJobId);
      if (cronData) {
        lastActivity = cronData.lastActivity || 0;
        lastMessage = cronData.lastMessage || '';
        extraInfo = cronData;
      }
    }
    // Also check JSONL sessions (for non-cron agents, or as supplement for cron agents)
    // This catches CURRENTLY RUNNING sessions that cron cache hasn't seen yet
    {
      const activity = getLastSessionActivity(a.sessionDir, a.sessionKey, a.transcriptId);
      if (activity) {
        if (activity.lastActivity > lastActivity) lastActivity = activity.lastActivity;
        if (!lastMessage && activity.lastMessage) lastMessage = activity.lastMessage;
      }
    }

    // Fallback: if lastActivity is 0 or very old, use state.md mtime or most recent session file mtime
    if (!lastActivity || (now - lastActivity) > 30 * 24 * 3600 * 1000) {
      try {
        const stateFile = path.join(AGENTS_DIR, a.sessionDir, 'memory', 'state.md');
        if (fs.existsSync(stateFile)) {
          const mtime = fs.statSync(stateFile).mtimeMs;
          if (mtime > lastActivity) lastActivity = mtime;
        }
      } catch {}
      // Also check most recent session file mtime
      if (!lastActivity || (now - lastActivity) > 30 * 24 * 3600 * 1000) {
        try {
          const sessDir = path.join(AGENTS_DIR, a.sessionDir, 'sessions');
          if (fs.existsSync(sessDir)) {
            const files = fs.readdirSync(sessDir).filter(f => f.endsWith('.jsonl') && !f.startsWith('sessions'));
            for (const f of files.slice(-3)) {
              const mtime = fs.statSync(path.join(sessDir, f)).mtimeMs;
              if (mtime > lastActivity) lastActivity = mtime;
            }
          }
        } catch {}
      }
    }

    const ageSec = lastActivity ? (now - lastActivity) / 1000 : 0;
    const ageMin = lastActivity ? Math.round(ageSec / 60) : null;

    let status = 'sleeping';
    // For cron-based agents, also check if next run is soon (within 2x cron interval)
    const nextRunSoon = extraInfo.nextRunAtMs && (extraInfo.nextRunAtMs - now) < 20 * 60 * 1000;
    if (a.cronJobId && extraInfo.isRunning) {
      status = 'working';
    } else if (lastActivity && ageSec < ACTIVE_THRESHOLD / 1000) {
      status = 'working';
    } else if (lastActivity && ageSec < 20 * 60) {
      status = 'idle';
    } else if (a.cronJobId && nextRunSoon) {
      status = 'idle';
    }

    // Compute mood from recent performance data
    let mood = 'neutral'; // neutral | happy | stressed | tired
    // Sleeping agents are "tired"
    if (status === 'sleeping' && (!ageMin || ageMin > 60)) mood = 'tired';
    else if (status === 'working') mood = 'happy';

    // Remove cron 'status' field before spreading to avoid overwriting computed status
    const { status: _cronStatus, ...extraInfoClean } = extraInfo;
    return {
      name: a.name,
      role: a.role,
      color: a.color,
      status, // working | idle | sleeping
      mood, // happy | neutral | stressed | tired
      lastActivity,
      lastMessage,
      ageMin,
      sessionKey: a.sessionKey,
      sessionDir: a.sessionDir,
      cronJobId: a.cronJobId || null,
      cronStatus: _cronStatus, // preserve as separate field
      discovered: a.discovered || false, // true for dynamically found agents (not in KNOWN_AGENTS)
      ...extraInfoClean,
    };
  });

  // Filter out stale agents (inactive > 7 days) unless hideStale is disabled in config
  const STALE_THRESHOLD = (_config.hideStaleAfterDays ?? 7) * 24 * 60; // minutes
  const filteredAgents = STALE_THRESHOLD > 0
    ? agents.filter(a => !a.ageMin || a.ageMin < STALE_THRESHOLD)
    : agents;

  const result = { agents: filteredAgents, timestamp: now };
  _agentsCache = result; _agentsCacheTime = now;
  return result;
}

function getQueue() {
  const result = { active: [], review: [], nextUp: [], parked: [], raw: '' };
  try {
    if (fs.existsSync(QUEUE_FILE)) {
      const content = fs.readFileSync(QUEUE_FILE, 'utf8');
      result.raw = content;

      // Parse sections by splitting on ## headers
      const sections = content.split(/^## /m);
      for (const sec of sections) {
        const lines = sec.split('\n');
        const header = lines[0]?.trim() || '';

        if (header.startsWith('Active')) {
          for (const line of lines) {
            if (!line.includes('|')) continue;
            const cells = line.split('|').map(c => c.trim()).filter(Boolean);
            if (cells.length >= 5 && /\d+/.test(cells[0].replace(/[~#]/g, ''))) {
              result.active.push({
                num: cells[0].replace(/[~#]/g, '').trim(),
                file: (cells[1] || '').replace(/`/g, ''),
                type: cells[2] || '',
                state: cells[3] || '',
                owner: cells[4] || '',
                since: cells[5] || '',
                complete: cells[0].includes('~~') || (cells[3] || '').includes('✅'),
              });
            }
          }
        }

        if (header.startsWith('Review Queue')) {
          for (const line of lines) {
            if (!line.includes('|')) continue;
            const cells = line.split('|').map(c => c.trim()).filter(Boolean);
            if (cells.length >= 2 && cells[0].includes('.md')) {
              result.review.push({ file: cells[0].replace(/`/g, ''), type: cells[1] || '', since: cells[2] || '' });
            }
          }
        }
      }
    }
  } catch (e) { result.error = e.message; }

  // Also get WR files for kanban
  try {
    const files = fs.readdirSync(WR_DIR).filter(f => f.endsWith('.md') && !f.startsWith('_'));
    result.wrs = files.map(f => {
      const content = fs.readFileSync(path.join(WR_DIR, f), 'utf8');
      const get = (key) => content.match(new RegExp(`\\*\\*${key}:\\*\\*\\s*(.+)`))?.[1]?.trim() || '';
      const title = content.match(/^#\s*WR:\s*(.+)/m)?.[1] || f;
      const stat = fs.statSync(path.join(WR_DIR, f)); return { file: f, title, type: get('Type'), priority: get('Priority'), status: get('Status'), created: get('Created'), owner: get('Owner'), mtime: stat.mtimeMs };
    });
  } catch { result.wrs = []; }

  return result;
}

// Memory growth history — append a snapshot every 15 min
const MEMORY_HISTORY_FILE = path.join(__dirname, 'memory-history.json');
const MEMORY_HISTORY_MAX = 200; // ~50 hours at 15-min intervals
let _memHistory = [];
try { if (fs.existsSync(MEMORY_HISTORY_FILE)) _memHistory = JSON.parse(fs.readFileSync(MEMORY_HISTORY_FILE, 'utf8')); } catch {}

function appendMemorySnapshot(totalPoints, memFileCount, collections) {
  const now = Date.now();
  const last = _memHistory[_memHistory.length - 1];
  // Only append if 15+ min since last snapshot
  if (last && (now - last.ts) < 14 * 60 * 1000) return;
  const collectionBreakdown = {};
  for (const c of (collections || [])) { if (c.points) collectionBreakdown[c.name] = c.points; }
  _memHistory.push({ ts: now, totalPoints, memFileCount, collections: collectionBreakdown });
  if (_memHistory.length > MEMORY_HISTORY_MAX) _memHistory = _memHistory.slice(-MEMORY_HISTORY_MAX);
  try { fs.writeFileSync(MEMORY_HISTORY_FILE, JSON.stringify(_memHistory)); } catch {}
}

function getMemoryHistory() {
  return { history: _memHistory, timestamp: Date.now() };
}

function getMemory() {
  try {
    const resp = execSync("curl -s --connect-timeout 0.3 --max-time 0.5 http://localhost:6333/collections", { encoding: 'utf8' });
    const data = JSON.parse(resp);
    const collections = data.result?.collections || [];
    let totalPoints = 0;
    const details = [];
    for (const c of collections) {
      try {
        const info = JSON.parse(execSync(`curl -s --connect-timeout 0.3 --max-time 0.5 http://localhost:6333/collections/${c.name}`, { encoding: 'utf8' }));
        const pts = info.result?.points_count || 0;
        totalPoints += pts;
        details.push({ name: c.name, points: pts, vectors: info.result?.vectors_count || 0, status: info.result?.status || 'unknown' });
      } catch { details.push({ name: c.name, points: 0 }); }
    }
    // Scan agent memory files
    const memFiles = [];
    try {
      for (const agent of discoverAgents()) {
        const memDir = path.join(AGENTS_DIR, agent.sessionDir, 'memory');
        if (!fs.existsSync(memDir)) continue;
        const files = fs.readdirSync(memDir).filter(f => !f.startsWith('.'));
        for (const f of files) {
          try {
            const st = fs.statSync(path.join(memDir, f));
            if (st.isFile()) {
              memFiles.push({ name: `${agent.name}/${f}`, sizeKB: (st.size / 1024).toFixed(1), mtime: st.mtimeMs });
            }
          } catch {}
        }
      }
    } catch {}
    memFiles.sort((a, b) => b.mtime - a.mtime);
    const result = { collections: details, count: collections.length, totalPoints, status: 'online', memFiles: memFiles.slice(0, 20), memFileCount: memFiles.length, timestamp: Date.now() };
    appendMemorySnapshot(totalPoints, memFiles.length, details);
    return result;
  } catch {
    return { collections: [], count: 0, totalPoints: 0, status: 'offline', timestamp: Date.now() };
  }
}

function getHealthScore() {
  // Composite 0-100 health score from CPU, memory, services, and agent activity
  try {
    const sys = getSystem();
    const agents = getAgents();
    let score = 100;
    const breakdown = [];

    // CPU penalty: lose up to 25 pts for high CPU
    const cpuUsed = sys.cpu ? (sys.cpu.user + sys.cpu.sys) : 0;
    if (cpuUsed > 90) { score -= 25; breakdown.push({ label: 'CPU critical', impact: -25 }); }
    else if (cpuUsed > 70) { const p = Math.round((cpuUsed - 70) / 20 * 25); score -= p; breakdown.push({ label: 'CPU high', impact: -p }); }

    // Memory penalty: lose up to 25 pts
    const memPct = sys.memory?.pctUsed || 0;
    if (memPct > 90) { score -= 25; breakdown.push({ label: 'Memory critical', impact: -25 }); }
    else if (memPct > 75) { const p = Math.round((memPct - 75) / 15 * 25); score -= p; breakdown.push({ label: 'Memory high', impact: -p }); }

    // Services penalty: lose up to 20 pts for down services
    const downServices = (sys.services || []).filter(s => s.status === 'stopped');
    if (downServices.length > 0) {
      const p = Math.min(20, downServices.length * 10);
      score -= p;
      breakdown.push({ label: `${downServices.length} service(s) down`, impact: -p });
    }

    // Agent activity: lose up to 15 pts if no agents are working
    const working = (agents.agents || []).filter(a => a.status === 'working').length;
    const total = (agents.agents || []).length;
    if (total > 0 && working === 0) {
      // Only penalize during work hours (8am-10pm PT)
      const hr = new Date().getHours();
      if (hr >= 8 && hr <= 22) { score -= 10; breakdown.push({ label: 'No agents working', impact: -10 }); }
    }

    // Disk penalty: lose up to 15 pts
    const diskPct = parseInt(sys.disk?.percent) || 0;
    if (diskPct > 90) { score -= 15; breakdown.push({ label: 'Disk critical', impact: -15 }); }
    else if (diskPct > 80) { const p = Math.round((diskPct - 80) / 10 * 15); score -= p; breakdown.push({ label: 'Disk high', impact: -p }); }

    score = Math.max(0, Math.min(100, score));
    const grade = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F';

    return { score, grade, breakdown, cpu: cpuUsed, memPct, diskPct, working, total, timestamp: Date.now() };
  } catch (e) { return { score: -1, grade: '?', error: e.message }; }
}

function getSystem() {
  try {
    const cpuRaw = execSync("top -l 1 -n 0 | grep 'CPU usage'", { encoding: 'utf8', timeout: 2000 }).trim();
    const cpuMatch = cpuRaw.match(/([\d.]+)% user.*?([\d.]+)% sys.*?([\d.]+)% idle/);
    const cpu = cpuMatch ? { user: +cpuMatch[1], sys: +cpuMatch[2], idle: +cpuMatch[3] } : { user: 0, sys: 0, idle: 100 };

    const memRaw = execSync("vm_stat", { encoding: 'utf8', timeout: 3000 });
    const pageSize = 16384;
    const active = +(memRaw.match(/Pages active:\s+(\d+)/)?.[1] || 0) * pageSize;
    const wired = +(memRaw.match(/Pages wired down:\s+(\d+)/)?.[1] || 0) * pageSize;
    const compressed = +(memRaw.match(/Pages occupied by compressor:\s+(\d+)/)?.[1] || 0) * pageSize;
    const speculative = +(memRaw.match(/Pages speculative:\s+(\d+)/)?.[1] || 0) * pageSize;
    const free = +(memRaw.match(/Pages free:\s+(\d+)/)?.[1] || 0) * pageSize;
    const totalMem = +(execSync("/usr/sbin/sysctl -n hw.memsize", { encoding: 'utf8' }).trim());
    const usedMem = active + wired + compressed + speculative;

    const diskRaw = execSync("df -h / | tail -1", { encoding: 'utf8' }).trim().split(/\s+/);
    const disk = { total: diskRaw[1], used: diskRaw[2], available: diskRaw[3], percent: diskRaw[4] };

    const services = [];
    try { execSync("curl -s --connect-timeout 0.3 --max-time 0.5 http://localhost:6333/collections", { encoding: 'utf8' }); services.push({ name: 'Qdrant', status: 'running', port: 6333 }); } catch { /* Qdrant not running — omit from list */ }
    try { execSync("/usr/bin/pgrep -f 'openclaw-gateway' > /dev/null 2>&1"); services.push({ name: 'Gateway', status: 'running', port: 18789 }); } catch { services.push({ name: 'Gateway', status: 'stopped', port: 18789 }); }
    services.push({ name: 'Agent Space', status: 'running', port: 18790 });

    // Uptime
    let uptime = '';
    try { uptime = execSync("uptime", { encoding: 'utf8', timeout: 2000 }).trim(); } catch {}

    // Network I/O from netstat
    let network = null;
    try {
      const netRaw = execSync("/usr/sbin/netstat -ib 2>/dev/null | grep '^en0' | head -1", { encoding: 'utf8', timeout: 3000 }).trim();
      const parts = netRaw.split(/\s+/);
      if (parts.length >= 10) {
        const ibytes = +parts[6] || 0;
        const obytes = +parts[9] || 0;
        const fmtBytes = b => b >= 1e9 ? (b/1e9).toFixed(1)+'GB' : b >= 1e6 ? (b/1e6).toFixed(1)+'MB' : b >= 1e3 ? (b/1e3).toFixed(0)+'KB' : b+'B';
        network = { iface: 'en0', inBytes: ibytes, outBytes: obytes, inFmt: fmtBytes(ibytes), outFmt: fmtBytes(obytes), ipkts: +parts[4] || 0, opkts: +parts[7] || 0 };
      }
    } catch {}

    return { cpu, memory: { total: totalMem, used: usedMem, free, pctUsed: Math.round(usedMem / totalMem * 100), totalGB: (totalMem / 1e9).toFixed(1), usedGB: (usedMem / 1e9).toFixed(1) }, disk, network, services, uptime, timestamp: Date.now() };
  } catch (e) { return { error: e.message }; }
}

// Async version for SSE ticks (avoids blocking event loop with top/vm_stat)
let _cachedSystem = null;
function getSystemAsync() {
  return new Promise((resolve) => {
    execAsync("top -l 1 -n 0 2>/dev/null | grep 'CPU usage'", { timeout: 5000, encoding: 'utf8' }, (err, cpuRaw) => {
      try {
        const cpu = { user: 0, sys: 0, idle: 100 };
        if (!err && cpuRaw) {
          const m = cpuRaw.match(/([\d.]+)% user.*?([\d.]+)% sys.*?([\d.]+)% idle/);
          if (m) { cpu.user = +m[1]; cpu.sys = +m[2]; cpu.idle = +m[3]; }
        }
        // These are fast enough to be sync
        const memRaw = execSync("vm_stat", { encoding: 'utf8', timeout: 3000 });
        const pageSize = 16384;
        const active = +(memRaw.match(/Pages active:\s+(\d+)/)?.[1] || 0) * pageSize;
        const wired = +(memRaw.match(/Pages wired down:\s+(\d+)/)?.[1] || 0) * pageSize;
        const compressed = +(memRaw.match(/Pages occupied by compressor:\s+(\d+)/)?.[1] || 0) * pageSize;
        const speculative = +(memRaw.match(/Pages speculative:\s+(\d+)/)?.[1] || 0) * pageSize;
        const free = +(memRaw.match(/Pages free:\s+(\d+)/)?.[1] || 0) * pageSize;
        const totalMem = +(execSync("/usr/sbin/sysctl -n hw.memsize", { encoding: 'utf8' }).trim());
        const usedMem = active + wired + compressed + speculative;
        const diskRaw = execSync("df -h / | tail -1", { encoding: 'utf8' }).trim().split(/\s+/);
        const disk = { total: diskRaw[1], used: diskRaw[2], available: diskRaw[3], percent: diskRaw[4] };
        const services = [];
        try { execSync("curl -s --connect-timeout 0.3 --max-time 0.5 http://localhost:6333/collections", { encoding: 'utf8' }); services.push({ name: 'Qdrant', status: 'running', port: 6333 }); } catch { /* omit if not running */ }
        try { execSync("/usr/bin/pgrep -f 'openclaw-gateway' > /dev/null 2>&1"); services.push({ name: 'Gateway', status: 'running', port: 18789 }); } catch { services.push({ name: 'Gateway', status: 'stopped', port: 18789 }); }
        services.push({ name: 'Agent Space', status: 'running', port: 18790 });
        let uptime = '';
        try { uptime = execSync("uptime", { encoding: 'utf8', timeout: 2000 }).trim(); } catch {}
        let network = null;
        try {
          const netRaw = execSync("/usr/sbin/netstat -ib 2>/dev/null | grep '^en0' | head -1", { encoding: 'utf8', timeout: 3000 }).trim();
          const parts = netRaw.split(/\s+/);
          if (parts.length >= 10) {
            const ibytes = +parts[6] || 0;
            const obytes = +parts[9] || 0;
            const fmtBytes = b => b >= 1e9 ? (b/1e9).toFixed(1)+'GB' : b >= 1e6 ? (b/1e6).toFixed(1)+'MB' : b >= 1e3 ? (b/1e3).toFixed(0)+'KB' : b+'B';
            network = { iface: 'en0', inBytes: ibytes, outBytes: obytes, inFmt: fmtBytes(ibytes), outFmt: fmtBytes(obytes), ipkts: +parts[4] || 0, opkts: +parts[7] || 0 };
          }
        } catch {}
        _cachedSystem = { cpu, memory: { total: totalMem, used: usedMem, free, pctUsed: Math.round(usedMem / totalMem * 100), totalGB: (totalMem / 1e9).toFixed(1), usedGB: (usedMem / 1e9).toFixed(1) }, disk, network, services, uptime, timestamp: Date.now() };
        resolve(_cachedSystem);
      } catch (e) { resolve(_cachedSystem || { error: e.message }); }
    });
  });
}

// Network throughput rate tracking (delta between polls)
let _prevNetBytes = null; // { inBytes, outBytes, timestamp }
const _netRateHistory = { inRate: [], outRate: [] }; // last 30 samples
const NET_RATE_MAX = 30;

function computeNetRate(network) {
  if (!network) return null;
  const now = Date.now();
  let rate = null;
  if (_prevNetBytes) {
    const dtSec = (now - _prevNetBytes.timestamp) / 1000;
    if (dtSec > 0 && dtSec < 120) { // only if polls are <2min apart
      const inDelta = Math.max(0, network.inBytes - _prevNetBytes.inBytes);
      const outDelta = Math.max(0, network.outBytes - _prevNetBytes.outBytes);
      const inRate = inDelta / dtSec;
      const outRate = outDelta / dtSec;
      _netRateHistory.inRate.push(inRate);
      _netRateHistory.outRate.push(outRate);
      if (_netRateHistory.inRate.length > NET_RATE_MAX) _netRateHistory.inRate.shift();
      if (_netRateHistory.outRate.length > NET_RATE_MAX) _netRateHistory.outRate.shift();
      const fmtRate = r => r >= 1e6 ? (r/1e6).toFixed(1)+' MB/s' : r >= 1e3 ? (r/1e3).toFixed(1)+' KB/s' : Math.round(r)+' B/s';
      rate = { inRate, outRate, inRateFmt: fmtRate(inRate), outRateFmt: fmtRate(outRate), history: { inRate: [..._netRateHistory.inRate], outRate: [..._netRateHistory.outRate] } };
    }
  }
  _prevNetBytes = { inBytes: network.inBytes, outBytes: network.outBytes, timestamp: now };
  return rate;
}

// Disk usage breakdown by major directories
let _diskBreakdownCache = null;
let _diskBreakdownTime = 0;
const DISK_BREAKDOWN_TTL = 120000; // 2 min cache

function getDiskBreakdown() {
  const now = Date.now();
  if (_diskBreakdownCache && (now - _diskBreakdownTime) < DISK_BREAKDOWN_TTL) return _diskBreakdownCache;
  try {
    // Get total disk info
    const dfRaw = execSync("df -k / | tail -1", { encoding: 'utf8', timeout: 5000 }).trim().split(/\s+/);
    const totalKB = parseInt(dfRaw[1]) || 0;
    const usedKB = parseInt(dfRaw[2]) || 0;
    const availKB = parseInt(dfRaw[3]) || 0;

    // Get sizes of key directories (in KB, fast du with depth 0)
    const dirs = [
      { path: path.join(HOME, '.openclaw'), label: 'OpenClaw' },
      { path: path.join(HOME, '.openclaw', 'workspace'), label: 'Workspace' },
      { path: '/Applications', label: 'Applications' },
      { path: '/Library', label: 'Library' },
      { path: '/usr', label: '/usr' },
      { path: path.join(HOME, 'Library'), label: '~/Library' },
      { path: path.join(HOME, 'Downloads'), label: 'Downloads' },
      { path: path.join(HOME, 'Documents'), label: 'Documents' },
    ];
    const breakdown = [];
    for (const d of dirs) {
      try {
        const raw = execSync(`du -sk "${d.path}" 2>/dev/null | cut -f1`, { encoding: 'utf8', timeout: 3000 }).trim();
        const sizeKB = parseInt(raw) || 0;
        if (sizeKB > 0) breakdown.push({ label: d.label, path: d.path, sizeKB, sizeGB: (sizeKB / 1048576).toFixed(2) });
      } catch {}
    }
    breakdown.sort((a, b) => b.sizeKB - a.sizeKB);

    _diskBreakdownCache = {
      total: { totalKB, usedKB, availKB, totalGB: (totalKB / 1048576).toFixed(1), usedGB: (usedKB / 1048576).toFixed(1), availGB: (availKB / 1048576).toFixed(1) },
      breakdown,
      timestamp: now
    };
    _diskBreakdownTime = now;
    return _diskBreakdownCache;
  } catch (e) { return { error: e.message, breakdown: [] }; }
}

function getCron() {
  // Read openclaw cron config
  const cronFile = path.join(HOME, '.openclaw', 'openclaw.yaml');
  const crons = [];
  try {
    if (fs.existsSync(cronFile)) {
      const content = fs.readFileSync(cronFile, 'utf8');
      // Simple YAML cron parser - find cron entries
      const cronMatches = content.match(/label:\s*.+|schedule:\s*.+|enabled:\s*.+/g) || [];
      let current = {};
      for (const line of cronMatches) {
        if (line.includes('label:')) { if (current.label) crons.push(current); current = { label: line.split(':').slice(1).join(':').trim() }; }
        else if (line.includes('schedule:')) current.schedule = line.split(':').slice(1).join(':').trim();
        else if (line.includes('enabled:')) current.enabled = line.includes('true');
      }
      if (current.label) crons.push(current);
    }
  } catch {}
  return { crons, timestamp: Date.now() };
}

// Token cache — recalculate every 60s (scanning JSONLs is expensive)
let tokenCache = null;
let tokenCacheTime = 0;
const TOKEN_CACHE_TTL = 300000; // 5 min — scanning JSONLs is expensive

function getTokens() {
  if (tokenCache && Date.now() - tokenCacheTime < TOKEN_CACHE_TTL) return { ...tokenCache, timestamp: Date.now() };
  const pricing = { 'claude-opus-4.6': { input: 15, output: 75, cachedInput: 1.875 }, 'gpt-4o-mini': { input: 0.15, output: 0.60 }, 'text-embedding-3-small': { input: 0.02, output: 0 } };
  const agentsDir = path.join(HOME, '.openclaw', 'agents');
  const byAgent = {};
  let totalInput = 0, totalOutput = 0, totalCached = 0;
  try {
    if (fs.existsSync(agentsDir)) {
      for (const agent of fs.readdirSync(agentsDir)) {
        const sessDir = path.join(agentsDir, agent, 'sessions');
        if (!fs.existsSync(sessDir)) continue;
        let agentIn = 0, agentOut = 0, agentCached = 0;
        const files = fs.readdirSync(sessDir).filter(f => f.endsWith('.jsonl') && !f.startsWith('sessions'));
        for (const f of files) {
          try {
            const fp = path.join(sessDir, f);
            const stat = fs.statSync(fp);
            // Read entire file but cap at 2MB per file to avoid blocking
            const readSize = Math.min(stat.size, 2 * 1024 * 1024);
            const fd = fs.openSync(fp, 'r');
            const buf = Buffer.alloc(readSize);
            fs.readSync(fd, buf, 0, readSize, Math.max(0, stat.size - readSize));
            fs.closeSync(fd);
            const content = buf.toString('utf8');
            const lines = content.split('\n');
            for (const line of lines) {
              if (!line.includes('"usage"')) continue;
              try {
                const d = JSON.parse(line);
                const u = d?.message?.usage || d?.usage;
                if (u) {
                  agentIn += u.input || 0;
                  agentOut += u.output || 0;
                  agentCached += u.cacheRead || 0;
                }
              } catch {}
            }
          } catch {}
        }
        if (agentIn || agentOut) {
          byAgent[agent] = { input: agentIn, output: agentOut, cached: agentCached };
          totalInput += agentIn; totalOutput += agentOut; totalCached += agentCached;
        }
      }
    }
  } catch {}
  const p = pricing['claude-opus-4.6'];
  const estCost = (totalInput * p.input + totalCached * p.cachedInput + totalOutput * p.output) / 1_000_000;
  tokenCache = { pricing, totals: { input: totalInput, output: totalOutput, cached: totalCached }, estimatedCostUSD: Math.round(estCost * 100) / 100, byAgent, note: 'Estimated based on model pricing (last 2MB per session file)' };
  tokenCacheTime = Date.now();
  return { ...tokenCache, timestamp: Date.now() };
}

let _dailyTokensCache = null;
let _dailyTokensCacheTime = 0;
const DAILY_TOKENS_TTL = 300000;

function getTokensDaily() {
  const now = Date.now();
  if (_dailyTokensCache && now - _dailyTokensCacheTime < DAILY_TOKENS_TTL) return _dailyTokensCache;

  const pricing = { input: 15, output: 75, cachedInput: 1.875 }; // claude-opus-4.6 per 1M
  const agentsDir = path.join(HOME, '.openclaw', 'agents');
  const dailyMap = {}; // date -> { input, output, cached, byAgent: { agentName: { input, output } } }
  const DAYS = 30;
  const cutoff = now - DAYS * 86400000;

  try {
    if (!fs.existsSync(agentsDir)) return { days: [], agents: [] };
    for (const agent of fs.readdirSync(agentsDir)) {
      const sessDir = path.join(agentsDir, agent, 'sessions');
      if (!fs.existsSync(sessDir)) continue;
      const known = KNOWN_AGENTS[agent];
      const agentName = known ? known.name : agent;
      const allFiles = fs.readdirSync(sessDir).filter(f => f.endsWith('.jsonl') && !f.startsWith('sessions'));
      // Only scan files modified within our time window, limit to most recent 20
      const recentFiles = allFiles.map(f => {
        try { return { f, mt: fs.statSync(path.join(sessDir, f)).mtimeMs }; } catch { return null; }
      }).filter(x => x && x.mt >= cutoff).sort((a,b) => b.mt - a.mt).slice(0, 20);
      for (const { f } of recentFiles) {
        try {
          const fp = path.join(sessDir, f);
          const stat = fs.statSync(fp);
          // Skip files not modified in our window
          if (stat.mtimeMs < cutoff) continue;
          // Cap read at 2MB per file
          const readSize = Math.min(stat.size, 2 * 1024 * 1024);
          const fd = fs.openSync(fp, 'r');
          const buf = Buffer.alloc(readSize);
          fs.readSync(fd, buf, 0, readSize, Math.max(0, stat.size - readSize));
          fs.closeSync(fd);
          const lines = buf.toString('utf8').split('\n');
          for (const line of lines) {
            if (!line.includes('"usage"')) continue;
            try {
              const d = JSON.parse(line);
              const u = d?.message?.usage || d?.usage;
              if (!u) continue;
              // Extract timestamp
              let ts = d?.message?.timestamp || d?.timestamp || d?.ts;
              if (!ts) continue;
              const dt = new Date(ts);
              if (isNaN(dt.getTime()) || dt.getTime() < cutoff) continue;
              const dateKey = dt.toISOString().slice(0, 10);
              if (!dailyMap[dateKey]) dailyMap[dateKey] = { input: 0, output: 0, cached: 0, byAgent: {} };
              const day = dailyMap[dateKey];
              day.input += u.input || 0;
              day.output += u.output || 0;
              day.cached += u.cacheRead || 0;
              if (!day.byAgent[agentName]) day.byAgent[agentName] = { input: 0, output: 0 };
              day.byAgent[agentName].input += u.input || 0;
              day.byAgent[agentName].output += u.output || 0;
            } catch {}
          }
        } catch {}
      }
    }
  } catch {}

  // Build sorted days array
  const days = [];
  const allAgents = new Set();
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(now - i * 86400000);
    const key = d.toISOString().slice(0, 10);
    const day = dailyMap[key] || { input: 0, output: 0, cached: 0, byAgent: {} };
    const cost = (day.input * pricing.input + day.cached * pricing.cachedInput + day.output * pricing.output) / 1_000_000;
    Object.keys(day.byAgent).forEach(a => allAgents.add(a));
    days.push({ date: key, input: day.input, output: day.output, cached: day.cached, cost: Math.round(cost * 100) / 100, byAgent: day.byAgent });
  }

  _dailyTokensCache = { days, agents: [...allAgents] };
  _dailyTokensCacheTime = now;
  return _dailyTokensCache;
}

let _activityCache = null;
let _activityCacheTime = 0;
const ACTIVITY_CACHE_TTL = 30000; // 30s
function getActivity() {
  const now = Date.now();
  if (_activityCache && (now - _activityCacheTime) < ACTIVITY_CACHE_TTL) return { ..._activityCache, timestamp: now };
  try {
    const lines = [];
    // 1. WR activity
    const wrFiles = fs.readdirSync(WR_DIR).filter(f => f.endsWith('.md') && !f.startsWith('_'));
    const recentWrs = wrFiles.map(f => {
      const stat = fs.statSync(path.join(WR_DIR, f));
      return { file: f, mtime: stat.mtimeMs };
    }).sort((a, b) => b.mtime - a.mtime).slice(0, 10);
    recentWrs.forEach(w => {
      const content = fs.readFileSync(path.join(WR_DIR, w.file), 'utf8');
      const title = content.match(/^#\s+WR:\s*(.+)/m)?.[1] || w.file;
      const status = content.match(/\*\*Status:\*\*\s*\`?([^\`\n]+)/)?.[1]?.trim() || 'unknown';
      const owner = content.match(/\*\*Owner:\*\*\s*\`?([^\`\n]+)/)?.[1]?.trim() || '';
      lines.push({ ts: new Date(w.mtime).toISOString(), agent: owner || 'system', text: 'WR: ' + title + ' — ' + status, type: 'wr' });
    });

    // 2. Real agent activity from JSONL session files
    const SKIP_RE = /^(ANNOUNCE_SKIP|NO_REPLY|Agent Summary:?|Agent\s+\S+\s+Session Complete|undefined)$/i;
    const ONE_HOUR = 3600000;
    const now = Date.now();
    for (const agent of discoverAgents()) {
      try {
        const sessDir = path.join(AGENTS_DIR, agent.sessionDir, 'sessions');
        if (!fs.existsSync(sessDir)) continue;
        // Find most recently modified JSONL
        const files = fs.readdirSync(sessDir).filter(f => f.endsWith('.jsonl') && !f.endsWith('.lock') && !f.startsWith('sessions'));
        let bestFile = null, bestMtime = 0;
        for (const f of files) {
          const fp = path.join(sessDir, f);
          const st = fs.statSync(fp);
          if (st.mtimeMs > bestMtime) { bestMtime = st.mtimeMs; bestFile = fp; }
        }
        if (!bestFile || (now - bestMtime) > 6 * ONE_HOUR) continue; // skip stale files

        const stat = fs.statSync(bestFile);
        const readSize = Math.min(stat.size, 100000);
        const fd = fs.openSync(bestFile, 'r');
        const buf = Buffer.alloc(readSize);
        fs.readSync(fd, buf, 0, readSize, Math.max(0, stat.size - readSize));
        fs.closeSync(fd);
        const content = buf.toString('utf8');
        const jsonLines = content.trim().split('\n').filter(l => l.trim());

        // Extract recent assistant messages (up to 3 per agent)
        let found = 0;
        for (let i = jsonLines.length - 1; i >= 0 && found < 3; i--) {
          try {
            const entry = JSON.parse(jsonLines[i]);
            const msg = entry.message || entry;
            if (msg.role !== 'assistant' || !msg.content) continue;
            const contents = Array.isArray(msg.content) ? msg.content : [msg.content];
            for (const c of contents) {
              const txt = typeof c === 'string' ? c : (c.type === 'text' && c.text ? c.text : '');
              if (!txt || txt.trim().length < 10) continue;
              const cleaned = txt.trim().replace(/[^\x20-\x7E\u00A0-\uFFFF]/g, ' ').replace(/\s+/g, ' ').slice(0, 150);
              if (SKIP_RE.test(cleaned.trim())) continue;
              // Use entry timestamp or file mtime
              let ts = bestMtime;
              if (entry.timestamp) {
                const parsed = typeof entry.timestamp === 'string' ? new Date(entry.timestamp).getTime() : entry.timestamp;
                if (parsed > 0) ts = parsed;
              }
              if ((now - ts) > 6 * ONE_HOUR) continue;
              lines.push({ ts: new Date(ts).toISOString(), agent: agent.name, text: cleaned, type: 'agent' });
              found++;
              break; // one message per entry
            }
          } catch {}
        }
      } catch {}
    }

    // 3. Git commits from workspace
    try {
      const gitLog = execSync('git -C "' + path.join(__dirname, '..') + '" log --oneline --since="6 hours ago" --format="%aI|||%an|||%s" -20 2>/dev/null', { encoding: 'utf8', timeout: 3000 });
      gitLog.trim().split('\n').filter(l => l.includes('|||')).forEach(l => {
        const [ts, author, msg] = l.split('|||');
        if (ts && msg) lines.push({ ts, agent: author || 'git', text: msg, type: 'commit' });
      });
    } catch {}

    // 4. Check agent-status.json for recent activity (legacy)
    const statusFile = path.join(__dirname, 'agent-status.json');
    if (fs.existsSync(statusFile)) {
      try {
        const agents = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
        agents.forEach(a => {
          if (a.state === 'working' && a.task) {
            lines.push({ ts: a.lastActive || new Date().toISOString(), agent: a.name || '', text: a.name + ': ' + a.task, type: 'agent' });
          }
        });
      } catch {}
    }

    // Deduplicate by text similarity (keep newest)
    const seen = new Set();
    const deduped = [];
    lines.sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));
    for (const item of lines) {
      const key = (item.agent + ':' + (item.text || '').slice(0, 60)).toLowerCase();
      if (!seen.has(key)) { seen.add(key); deduped.push(item); }
    }

    _activityCache = { activity: deduped.slice(0, 40) };
    _activityCacheTime = now;
    return { ..._activityCache, timestamp: now };
  } catch (e) { return { activity: [], error: e.message }; }
}
function getAgentDetail(agentDir) {
  const now = Date.now();
  const agents = discoverAgents();
  const agent = agents.find(a => a.sessionDir === agentDir);
  if (!agent) return { error: 'Agent not found' };

  const result = {
    name: agent.name || agentDir,
    role: agent.role || 'Agent',
    color: agent.color || '#64748b',
    sessionDir: agentDir,
    discovered: agent.discovered || false,
    history: [],
    stateContent: '',
    sessionFiles: [],
    cronRuns: [],
  };

  // Read state.md
  try {
    const stateFile = path.join(AGENTS_DIR, agentDir, 'memory', 'state.md');
    if (fs.existsSync(stateFile)) {
      result.stateContent = fs.readFileSync(stateFile, 'utf8').slice(0, 3000);
      result.stateMtime = fs.statSync(stateFile).mtimeMs;
    }
  } catch {}

  // List session files
  const sessDir = path.join(AGENTS_DIR, agentDir, 'sessions');
  if (fs.existsSync(sessDir)) {
    try {
      result.sessionFiles = fs.readdirSync(sessDir)
        .filter(f => f.endsWith('.jsonl') && !f.endsWith('.lock'))
        .map(f => {
          const st = fs.statSync(path.join(sessDir, f));
          return { name: f, size: st.size, mtime: st.mtimeMs };
        })
        .sort((a, b) => b.mtime - a.mtime)
        .slice(0, 5);
    } catch {}
  }

  // Extract recent assistant messages from session files (last 20)
  if (result.sessionFiles.length) {
    const bestFile = path.join(sessDir, result.sessionFiles[0].name);
    try {
      const stat = fs.statSync(bestFile);
      const readSize = Math.min(stat.size, 500000);
      const fd = fs.openSync(bestFile, 'r');
      const buf = Buffer.alloc(readSize);
      fs.readSync(fd, buf, 0, readSize, Math.max(0, stat.size - readSize));
      fs.closeSync(fd);
      const lines = buf.toString('utf8').trim().split('\n').filter(l => l.trim());
      const SKIP_RE = /^(ANNOUNCE_SKIP|NO_REPLY|undefined)$/i;
      for (let i = lines.length - 1; i >= 0 && result.history.length < 20; i--) {
        try {
          const entry = JSON.parse(lines[i]);
          const msg = entry.message || entry;
          if (msg.role !== 'assistant' || !msg.content) continue;
          const contents = Array.isArray(msg.content) ? msg.content : [msg.content];
          for (const c of contents) {
            const txt = typeof c === 'string' ? c : (c.type === 'text' && c.text ? c.text : '');
            if (!txt || txt.trim().length < 5) continue;
            const cleaned = txt.trim().replace(/[^\x20-\x7E\u00A0-\uFFFF]/g, ' ').replace(/\s+/g, ' ').slice(0, 300);
            if (SKIP_RE.test(cleaned.trim())) continue;
            let ts = 0;
            if (entry.timestamp) {
              ts = typeof entry.timestamp === 'string' ? new Date(entry.timestamp).getTime() : entry.timestamp;
            }
            result.history.push({ text: cleaned, ts });
            break;
          }
        } catch {}
      }
    } catch {}
  }

  // Cron runs for cron agents — use cache instead of blocking execSync
  if (agent.cronJobId && _cronCache[agent.cronJobId]) {
    const cached = _cronCache[agent.cronJobId];
    if (cached.data) {
      result.cronRuns = [{
        ts: cached.data.finishedTs || cached.data.startedTs || 0,
        status: cached.data.isRunning ? 'running' : 'finished',
        summary: (cached.data.lastMessage || '').slice(0, 200),
      }];
    }
  }

  return result;
}

let _tlHeatCache = null;
let _tlHeatCacheTime = 0;
const TL_HEAT_CACHE_TTL = 300000;

function getTimelineHeatmap() {
  // Build a 6-hour activity heatmap per agent (15-min buckets = 24 slots)
  const now = Date.now();
  if (_tlHeatCache && (now - _tlHeatCacheTime) < TL_HEAT_CACHE_TTL) return { ..._tlHeatCache, timestamp: now };
  const SIX_HOURS = 6 * 3600 * 1000;
  const BUCKET_MS = 15 * 60 * 1000; // 15 min
  const BUCKETS = 24;
  const agents = discoverAgents();
  const result = { agents: [], bucketMinutes: 15, hours: 6, timestamp: now };

  for (const agent of agents) {
    const slots = new Array(BUCKETS).fill(0); // 0=no data, 1=active
    let found = false;

    // 1. Check cron runs for cron agents — use cache
    if (agent.cronJobId && _cronCache[agent.cronJobId]) {
      const cached = _cronCache[agent.cronJobId];
      if (cached.data) {
        const ts = cached.data.finishedTs || cached.data.startedTs || 0;
        if (ts && (now - ts) < SIX_HOURS) {
          const bucket = Math.floor((now - ts) / BUCKET_MS);
          if (bucket >= 0 && bucket < BUCKETS) { slots[BUCKETS - 1 - bucket] = 1; found = true; }
          if (cached.data.isRunning) { slots[BUCKETS - 1] = 1; found = true; }
        }
      }
    }

    // 2. Check JSONL session files for non-cron agents (or as supplement)
    if (!found) {
      const sessDir = path.join(AGENTS_DIR, agent.sessionDir, 'sessions');
      if (fs.existsSync(sessDir)) {
        try {
          const files = fs.readdirSync(sessDir).filter(f => f.endsWith('.jsonl') && !f.endsWith('.lock'));
          for (const f of files) {
            const fp = path.join(sessDir, f);
            const stat = fs.statSync(fp);
            if (now - stat.mtimeMs > SIX_HOURS) continue;
            // Read tail
            const readSize = Math.min(stat.size, 300000);
            const fd = fs.openSync(fp, 'r');
            const buf = Buffer.alloc(readSize);
            fs.readSync(fd, buf, 0, readSize, Math.max(0, stat.size - readSize));
            fs.closeSync(fd);
            const content = buf.toString('utf8');
            const jsonLines = content.trim().split('\n');
            for (let i = jsonLines.length - 1; i >= Math.max(0, jsonLines.length - 200); i--) {
              try {
                const entry = JSON.parse(jsonLines[i]);
                let ts = 0;
                if (entry.timestamp) {
                  ts = typeof entry.timestamp === 'string' ? new Date(entry.timestamp).getTime() : entry.timestamp;
                }
                if (!ts || (now - ts) > SIX_HOURS) continue;
                const bucket = Math.floor((now - ts) / BUCKET_MS);
                if (bucket >= 0 && bucket < BUCKETS) slots[BUCKETS - 1 - bucket] = 1;
              } catch {}
            }
          }
        } catch {}
      }
    }

    result.agents.push({
      name: agent.name || agent.sessionDir,
      color: agent.color || '#64748b',
      slots,
    });
  }

  _tlHeatCache = result;
  _tlHeatCacheTime = now;
  return result;
}

function getCalendar() {
  try {
    const gcalEvents = []; // gcal disabled — re-enable after gog auth login
    const files = fs.readdirSync(WR_DIR).filter(f => f.endsWith('.md') && !f.startsWith('_'));
    const wrs = files.map(f => {
      const content = fs.readFileSync(path.join(WR_DIR, f), 'utf8');
      const get = (key) => content.match(new RegExp(`\*\*${key}:\*\*\s*(.+)`))?.[1]?.trim() || '';
      const title = content.match(/^#\s*WR:\s*(.+)/m)?.[1] || f;
      return { file: f, title, status: get('Status'), type: get('Type'), created: get('Created') };
    });
    const active = wrs.filter(w => { const s = (w.status||'').toLowerCase(); return !s.includes('complete') && !s.includes('done'); });
    return { events: gcalEvents, activeWRs: active, timestamp: Date.now() };
  } catch (e) { return { events: [], activeWRs: [], error: e.message }; }
}

// --- SSE (Server-Sent Events) ---
const sseClients = new Set();
let _lastAgentHash = '';
let _lastActivityHash = '';
let _lastSystemHash = '';
let _lastTokensHash = '';
let _lastTimelineHash = '';
let _lastQueueHash = '';

function simpleHash(obj) {
  const s = JSON.stringify(obj);
  let h = 0, len = s.length;
  // Sample every 4th char for large payloads (>2KB) for speed
  const step = len > 2048 ? 4 : 1;
  for (let i = 0; i < len; i += step) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return String(h);
}

function broadcastSSE(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try { client.write(msg); } catch { sseClients.delete(client); }
  }
}

// SSE heartbeat every 30s to keep connections alive & measure latency
setInterval(() => {
  if (sseClients.size === 0) return;
  broadcastSSE('ping', { ts: Date.now(), clients: sseClients.size });
}, 30000);

// Push changes every 15s (agents/activity) and 30s (system/tokens/timeline) — staggered
let _sseTickCount = 0;
let _sseBusy = false;
setInterval(() => {
  _sseTickCount++;
  if (sseClients.size === 0 || _sseBusy) return;
  _sseBusy = true;

  try {
    const agents = getAgents();
    const ah = simpleHash(agents);
    if (ah !== _lastAgentHash) { _lastAgentHash = ah; broadcastSSE('agents', agents); }

    const activity = getActivity();
    const ach = simpleHash(activity);
    if (ach !== _lastActivityHash) { _lastActivityHash = ach; broadcastSSE('activity', activity); }

    // Queue every 2nd tick (~30s)
    if (_sseTickCount % 2 === 0) {
      const queue = getQueue();
      const qh = simpleHash(queue);
      if (qh !== _lastQueueHash) { _lastQueueHash = qh; broadcastSSE('queue', queue); }
    }

    // System + tokens every 3rd tick (~45s)
    if (_sseTickCount % 3 === 0) {
      getSystemAsync().then(sys => {
        const sh = simpleHash(sys);
        if (sh !== _lastSystemHash) {
          _lastSystemHash = sh;
          broadcastSSE('system', sys);
          // Persist CPU/memory metrics
          if (sys.cpu) recordMetric('cpu', sys.cpu.user + sys.cpu.sys);
          if (sys.memory) recordMetric('memory_used_gb', parseFloat(sys.memory.usedGB) || 0);
        }
      }).catch(() => {});

      try {
        const tokens = getTokens();
        const th = simpleHash(tokens);
        if (th !== _lastTokensHash) { _lastTokensHash = th; broadcastSSE('tokens', tokens); }
      } catch {}
    }

    // Timeline heatmap every 4th tick (~60s)
    if (_sseTickCount % 4 === 0) {
      try {
        const tl = getTimelineHeatmap();
        const tlh = simpleHash(tl);
        if (tlh !== _lastTimelineHash) { _lastTimelineHash = tlh; broadcastSSE('timeline', tl); }
      } catch {}
    }
  } catch (e) { console.error('SSE tick error:', e.message); }
  finally { _sseBusy = false; }
}, 15000);

// Performance metrics: aggregate cron run stats per agent
let _perfCache = null;
let _perfCacheTime = 0;
const PERF_CACHE_TTL = 300000;

let _uptimeCache = null;
let _uptimeCacheTime = 0;
const UPTIME_CACHE_TTL = 300000; // 5 min — very expensive, cron runs + JSONL scanning

function getUptime() {
  const now = Date.now();
  if (_uptimeCache && (now - _uptimeCacheTime) < UPTIME_CACHE_TTL) return { ..._uptimeCache, timestamp: now };
  const DAY_MS = 24 * 3600 * 1000;
  const BUCKET_MS = 15 * 60 * 1000; // 15-min buckets
  const BUCKETS = 96; // 24h / 15min
  const agents = discoverAgents();
  const results = [];

  for (const agent of agents) {
    const slots = new Array(BUCKETS).fill(0);

    // 1. Cron agents: use cached cron data instead of heavy execSync
    if (agent.cronJobId && _cronCache[agent.cronJobId]) {
      const cached = _cronCache[agent.cronJobId];
      if (cached.data) {
        const ts = cached.data.lastActivity || cached.data.finishedTs || cached.data.startedTs || 0;
        if (ts && (now - ts) < DAY_MS) {
          const bucket = Math.floor((now - ts) / BUCKET_MS);
          if (bucket >= 0 && bucket < BUCKETS) slots[BUCKETS - 1 - bucket] = 1;
          // If running, mark current bucket too
          if (cached.data.isRunning) slots[BUCKETS - 1] = 1;
        }
      }
    }

    // 2. JSONL session files: scan timestamps
    const sessDir = path.join(AGENTS_DIR, agent.sessionDir, 'sessions');
    if (fs.existsSync(sessDir)) {
      try {
        const files = fs.readdirSync(sessDir).filter(f => f.endsWith('.jsonl') && !f.endsWith('.lock'));
        for (const f of files) {
          const fp = path.join(sessDir, f);
          const stat = fs.statSync(fp);
          if (now - stat.mtimeMs > DAY_MS) continue;
          const readSize = Math.min(stat.size, 500000);
          const fd = fs.openSync(fp, 'r');
          const buf = Buffer.alloc(readSize);
          fs.readSync(fd, buf, 0, readSize, Math.max(0, stat.size - readSize));
          fs.closeSync(fd);
          const content = buf.toString('utf8');
          const jsonLines = content.trim().split('\n');
          for (let i = jsonLines.length - 1; i >= Math.max(0, jsonLines.length - 500); i--) {
            try {
              const entry = JSON.parse(jsonLines[i]);
              let ts = 0;
              if (entry.timestamp) {
                ts = typeof entry.timestamp === 'string' ? new Date(entry.timestamp).getTime() : entry.timestamp;
              }
              if (!ts || (now - ts) > DAY_MS) continue;
              const bucket = Math.floor((now - ts) / BUCKET_MS);
              if (bucket >= 0 && bucket < BUCKETS) slots[BUCKETS - 1 - bucket] = 1;
            } catch {}
          }
        }
      } catch {}
    }

    const activeSlots = slots.filter(s => s > 0).length;
    const uptimePct = Math.round((activeSlots / BUCKETS) * 100);

    results.push({
      name: agent.name || agent.sessionDir,
      color: agent.color || '#64748b',
      sessionDir: agent.sessionDir,
      uptimePct,
      activeSlots,
      totalSlots: BUCKETS,
      activeMinutes: activeSlots * 15,
      totalMinutes: BUCKETS * 15,
      slots, // for detailed sparkline
    });
  }

  results.sort((a, b) => b.uptimePct - a.uptimePct);
  const avgUptime = results.length ? Math.round(results.reduce((s, r) => s + r.uptimePct, 0) / results.length) : 0;

  _uptimeCache = { agents: results, avgUptime, bucketMinutes: 15, hours: 24 };
  _uptimeCacheTime = now;
  return { ..._uptimeCache, timestamp: now };
}

function getPerformance() {
  const now = Date.now();
  if (_perfCache && (now - _perfCacheTime) < PERF_CACHE_TTL) return { ..._perfCache, timestamp: now };

  const agents = discoverAgents().filter(a => a.cronJobId);
  const results = [];

  for (const agent of agents) {
    try {
      const raw = execSync(
        `openclaw cron runs --id ${agent.cronJobId} --limit 50 --timeout 5000 2>/dev/null`,
        { timeout: 8000, encoding: 'utf8' }
      );
      const lines = raw.split('\n');
      let jsonStr = '', braceDepth = 0, collecting = false;
      for (const line of lines) {
        if (!collecting && line.trim().startsWith('{')) collecting = true;
        if (collecting) {
          jsonStr += line + '\n';
          for (const ch of line) { if (ch === '{') braceDepth++; if (ch === '}') braceDepth--; }
          if (braceDepth === 0 && jsonStr.trim()) break;
        }
      }
      if (!jsonStr.trim()) continue;
      const parsed = JSON.parse(jsonStr);
      const entries = parsed.entries || [];
      if (!entries.length) continue;

      let total = 0, succeeded = 0, failed = 0, totalDuration = 0, durCount = 0;
      let last24h = 0, last1h = 0;
      const durations = [];
      const hourBuckets = new Array(24).fill(0); // last 24h, 1h buckets

      for (const e of entries) {
        if (e.action === 'started') continue; // skip partial
        total++;
        const ts = e.ts || e.runAtMs || 0;
        if (ts && (now - ts) < 86400000) { last24h++; const bucket = Math.floor((now - ts) / 3600000); if (bucket < 24) hourBuckets[23 - bucket]++; }
        if (ts && (now - ts) < 3600000) last1h++;
        if (e.status === 'ok' || e.status === 'success') succeeded++;
        else if (e.status === 'error' || e.status === 'fail') failed++;
        else succeeded++; // assume ok if no explicit error
        if (e.durationMs && e.durationMs > 0) { totalDuration += e.durationMs; durCount++; durations.push(e.durationMs); }
      }

      const avgDuration = durCount > 0 ? Math.round(totalDuration / durCount) : 0;
      const maxDuration = durations.length ? Math.max(...durations) : 0;
      const minDuration = durations.length ? Math.min(...durations) : 0;
      const successRate = total > 0 ? Math.round((succeeded / total) * 100) : 0;

      // Duration trend: recent runs with timestamps (newest first → reverse for chart)
      const durationTrend = [];
      const errorLog = [];
      for (const e of entries) {
        if (e.action === 'started') continue;
        const ts = e.ts || e.runAtMs || 0;
        if (e.durationMs && e.durationMs > 0 && ts) {
          durationTrend.push({ ts, ms: e.durationMs });
        }
        if (e.status === 'error' || e.status === 'fail') {
          errorLog.push({ ts, summary: (e.summary || '').slice(0, 300), durationMs: e.durationMs || 0 });
        }
      }
      durationTrend.reverse(); // oldest first for charting

      // Success rate trend: rolling window over runs (oldest first)
      // Each point = success rate of last N runs at that point
      const successRateTrend = [];
      const runTimeline = []; // {ts, ok}
      for (const e of [...entries].reverse()) { // oldest first
        if (e.action === 'started') continue;
        const ts = e.ts || e.runAtMs || 0;
        const ok = !(e.status === 'error' || e.status === 'fail');
        if (ts) runTimeline.push({ ts, ok });
      }
      // Compute rolling success rate (window of 5 runs)
      const winSize = Math.min(5, Math.max(2, Math.floor(runTimeline.length / 3)));
      for (let i = winSize - 1; i < runTimeline.length; i++) {
        const slice = runTimeline.slice(i - winSize + 1, i + 1);
        const rate = Math.round((slice.filter(r => r.ok).length / slice.length) * 100);
        successRateTrend.push({ ts: runTimeline[i].ts, rate });
      }

      results.push({
        name: agent.name || agent.sessionDir,
        color: agent.color || '#64748b',
        cronJobId: agent.cronJobId,
        total, succeeded, failed, successRate,
        avgDurationMs: avgDuration, maxDurationMs: maxDuration, minDurationMs: minDuration,
        last24h, last1h,
        hourBuckets,
        durationTrend: durationTrend.slice(-30), // last 30 data points
        successRateTrend: successRateTrend.slice(-30),
        errorLog: errorLog.slice(0, 10),
      });
    } catch {}
  }

  // Summary
  const totalRuns = results.reduce((s, r) => s + r.total, 0);
  const totalSucceeded = results.reduce((s, r) => s + r.succeeded, 0);
  const totalFailed = results.reduce((s, r) => s + r.failed, 0);
  const overallRate = totalRuns > 0 ? Math.round((totalSucceeded / totalRuns) * 100) : 0;

  _perfCache = { agents: results, summary: { totalRuns, totalSucceeded, totalFailed, overallSuccessRate: overallRate } };
  _perfCacheTime = now;
  return { ..._perfCache, timestamp: now };
}

// --- Task Completion Stats (WR-based) ---
let _completionCache = null;
let _completionCacheTime = 0;
const COMPLETION_CACHE_TTL = 300000;

function getCompletionStats() {
  const now = Date.now();
  if (_completionCache && (now - _completionCacheTime) < COMPLETION_CACHE_TTL) return { ..._completionCache, timestamp: now };

  const wrs = [];
  try {
    const files = fs.readdirSync(WR_DIR).filter(f => f.endsWith('.md') && !f.startsWith('_'));
    for (const f of files) {
      try {
        const content = fs.readFileSync(path.join(WR_DIR, f), 'utf8');
        const get = (key) => content.match(new RegExp(`\\*\\*${key}:\\*\\*\\s*\`?([^\`\\n]+)`))?.[1]?.trim() || '';
        const title = content.match(/^#\s*WR:\s*(.+)/m)?.[1] || f;
        const status = get('Status').toLowerCase();
        const created = get('Created');
        const owner = get('Owner');
        const type = get('Type');
        const priority = get('Priority').toLowerCase();
        const stat = fs.statSync(path.join(WR_DIR, f));
        const isComplete = status.includes('complete') || status.includes('done');
        const createdMs = created ? new Date(created).getTime() : stat.birthtimeMs;
        const completedMs = isComplete ? stat.mtimeMs : 0;
        const durationMs = isComplete && createdMs ? completedMs - createdMs : 0;
        wrs.push({ file: f, title, status, owner, type, priority, isComplete, createdMs, completedMs, durationMs });
      } catch {}
    }
  } catch {}

  const total = wrs.length;
  const completed = wrs.filter(w => w.isComplete).length;
  const open = total - completed;
  const rate = total > 0 ? Math.round((completed / total) * 100) : 0;

  // Avg time to complete (only for completed WRs with valid duration)
  const completedWithDuration = wrs.filter(w => w.isComplete && w.durationMs > 60000);
  const avgDurationMs = completedWithDuration.length
    ? Math.round(completedWithDuration.reduce((s, w) => s + w.durationMs, 0) / completedWithDuration.length)
    : 0;

  // By owner
  const byOwner = {};
  wrs.forEach(w => {
    const o = w.owner || 'unassigned';
    if (!byOwner[o]) byOwner[o] = { total: 0, completed: 0 };
    byOwner[o].total++;
    if (w.isComplete) byOwner[o].completed++;
  });

  // By type
  const byType = {};
  wrs.forEach(w => {
    const t = w.type || 'other';
    if (!byType[t]) byType[t] = { total: 0, completed: 0 };
    byType[t].total++;
    if (w.isComplete) byType[t].completed++;
  });

  // By priority
  const byPriority = {};
  wrs.forEach(w => {
    const p = w.priority || 'none';
    if (!byPriority[p]) byPriority[p] = { total: 0, completed: 0 };
    byPriority[p].total++;
    if (w.isComplete) byPriority[p].completed++;
  });

  // Recent completions (last 5)
  const recentCompletions = wrs
    .filter(w => w.isComplete && w.completedMs)
    .sort((a, b) => b.completedMs - a.completedMs)
    .slice(0, 5)
    .map(w => ({ title: w.title, owner: w.owner, completedAt: new Date(w.completedMs).toISOString(), durationMs: w.durationMs }));

  _completionCache = { total, completed, open, rate, avgDurationMs, byOwner, byType, byPriority, recentCompletions };
  _completionCacheTime = now;
  return { ..._completionCache, timestamp: now };
}

// --- Agent Communication Graph ---
// Scans session JSONL files for tool_use calls that reference other agents (sessions_send, sessions_spawn)
// and builds an edge list of who communicates with whom.
let _commGraphCache = null;
let _commGraphCacheTime = 0;
const COMM_GRAPH_CACHE_TTL = 120000;

// --- Agent Dependency Graph: who spawns whom ---
let _depGraphCache = null, _depGraphCacheTime = 0;
const DEP_GRAPH_CACHE_TTL = 60000;

function getDependencyGraph() {
  const now = Date.now();
  if (_depGraphCache && (now - _depGraphCacheTime) < DEP_GRAPH_CACHE_TTL) return { ..._depGraphCache, timestamp: now };

  const agents = discoverAgents();
  const agentNames = {};
  for (const a of agents) {
    agentNames[a.sessionDir] = a.name;
    agentNames[a.name] = a.name;
    if (a.sessionKey) agentNames[a.sessionKey] = a.name;
  }

  // edges: { "parent->child": { count, lastTs, tasks: [] } }
  const edges = {};
  const nodeSet = new Set();
  const nodeTypes = {}; // name -> 'persistent' | 'cron' | 'subagent' | 'unknown'

  for (const agent of agents) {
    nodeTypes[agent.name] = agent.cronJobId ? 'cron' : agent.persistent ? 'persistent' : 'unknown';
    const sessDir = path.join(AGENTS_DIR, agent.sessionDir, 'sessions');
    if (!fs.existsSync(sessDir)) continue;
    const fromName = agent.name;

    try {
      const files = fs.readdirSync(sessDir).filter(f => f.endsWith('.jsonl') && !f.endsWith('.lock'));
      for (const f of files) {
        const fp = path.join(sessDir, f);
        const stat = fs.statSync(fp);
        if (now - stat.mtimeMs > 7 * 24 * 3600 * 1000) continue;

        const readSize = Math.min(stat.size, 500000);
        const fd = fs.openSync(fp, 'r');
        const buf = Buffer.alloc(readSize);
        fs.readSync(fd, buf, 0, readSize, Math.max(0, stat.size - readSize));
        fs.closeSync(fd);
        const lines = buf.toString('utf8').trim().split('\n');

        for (const line of lines) {
          if (!line.includes('sessions_spawn') && !line.includes('subagent')) continue;
          try {
            const entry = JSON.parse(line);
            const msg = entry.message || entry;
            if (msg.role !== 'assistant' || !msg.content) continue;
            const contents = Array.isArray(msg.content) ? msg.content : [msg.content];
            for (const c of contents) {
              if (typeof c !== 'object') continue;
              const toolName = c.name || c.function?.name || '';
              const isToolBlock = c.type === 'tool_use' || c.type === 'function' || c.type === 'toolCall';
              if (!isToolBlock && !toolName) continue;
              if (toolName !== 'sessions_spawn') continue;

              const input = c.input || c.arguments || (c.function?.arguments ? (() => { try { return JSON.parse(c.function.arguments); } catch { return {}; } })() : {});
              let targetName = null;
              const sk = input.label || input.agentId || '';
              if (agentNames[sk]) targetName = agentNames[sk];
              else {
                const parts = sk.split(/[:\-_]/);
                for (const p of parts) { if (agentNames[p]) { targetName = agentNames[p]; break; } }
              }
              // If no match, use the label/agentId as-is (sub-agent)
              if (!targetName && sk) {
                targetName = sk.split(':').pop() || sk;
                if (!nodeTypes[targetName]) nodeTypes[targetName] = 'subagent';
              }

              if (targetName && targetName !== fromName) {
                const key = `${fromName}->${targetName}`;
                if (!edges[key]) edges[key] = { count: 0, lastTs: 0, tasks: [] };
                edges[key].count++;
                const ts = entry.timestamp ? (typeof entry.timestamp === 'string' ? new Date(entry.timestamp).getTime() : entry.timestamp) : 0;
                if (ts > edges[key].lastTs) edges[key].lastTs = ts;
                const task = (input.task || '').slice(0, 100);
                if (task && edges[key].tasks.length < 3 && !edges[key].tasks.includes(task)) {
                  edges[key].tasks.push(task);
                }
                nodeSet.add(fromName);
                nodeSet.add(targetName);
              }
            }
          } catch {}
        }
      }
    } catch {}
  }

  // Auto-generate baseline relationships from discovered agents
  // The first agent (alphabetically by role) in each category connects to others
  // This ensures the graph always has edges even without spawn data
  const baselineRels = [];
  // Derive from agentNames already discovered — no hardcoded names
  // Skip baseline relationships; real spawn data and sessions_send data provide edges
  for (const rel of baselineRels) {
    const key = `${rel.from}->${rel.to}`;
    if (!edges[key]) {
      edges[key] = { count: 0, lastTs: 0, tasks: [], baseline: true, label: rel.label };
    }
    nodeSet.add(rel.from);
    nodeSet.add(rel.to);
    if (!nodeTypes[rel.from]) nodeTypes[rel.from] = 'persistent';
    if (!nodeTypes[rel.to]) nodeTypes[rel.to] = 'persistent';
  }

  const nodes = [];
  for (const name of nodeSet) {
    const a = agents.find(x => x.name === name);
    const type = nodeTypes[name] || 'unknown';
    const spawnedBy = Object.keys(edges).filter(k => k.endsWith(`->${name}`)).length;
    const spawns = Object.keys(edges).filter(k => k.startsWith(`${name}->`)).length;
    nodes.push({ name, color: a?.color || '#64748b', role: a?.role || 'Sub-agent', type, spawnedBy, spawns });
  }

  const edgeList = Object.entries(edges).map(([key, data]) => {
    const [from, to] = key.split('->');
    return { from, to, count: data.count, lastTs: data.lastTs, tasks: data.tasks, baseline: !!data.baseline, label: data.label || '' };
  }).sort((a, b) => b.count - a.count);

  _depGraphCache = { nodes, edges: edgeList };
  _depGraphCacheTime = now;
  return { ..._depGraphCache, timestamp: now };
}

function getCommGraph() {
  const now = Date.now();
  if (_commGraphCache && (now - _commGraphCacheTime) < COMM_GRAPH_CACHE_TTL) return { ..._commGraphCache, timestamp: now };

  const agents = discoverAgents();
  const agentNames = {};
  for (const a of agents) {
    agentNames[a.sessionDir] = a.name;
    agentNames[a.name] = a.name;
    if (a.sessionKey) agentNames[a.sessionKey] = a.name;
  }

  // edges: { "from->to": count }
  const edges = {};
  const nodeSet = new Set();

  for (const agent of agents) {
    const sessDir = path.join(AGENTS_DIR, agent.sessionDir, 'sessions');
    if (!fs.existsSync(sessDir)) continue;
    const fromName = agent.name;
    nodeSet.add(fromName);

    try {
      const files = fs.readdirSync(sessDir).filter(f => f.endsWith('.jsonl') && !f.endsWith('.lock'));
      // Only scan recent files (last 48h)
      for (const f of files) {
        const fp = path.join(sessDir, f);
        const stat = fs.statSync(fp);
        if (now - stat.mtimeMs > 7 * 24 * 3600 * 1000) continue;

        const readSize = Math.min(stat.size, 500000);
        const fd = fs.openSync(fp, 'r');
        const buf = Buffer.alloc(readSize);
        fs.readSync(fd, buf, 0, readSize, Math.max(0, stat.size - readSize));
        fs.closeSync(fd);
        const content = buf.toString('utf8');
        const lines = content.trim().split('\n');

        for (const line of lines) {
          // Quick filter: only parse lines referencing session/spawn/send/agent
          if (!line.includes('sessions_send') && !line.includes('sessions_spawn') && !line.includes('message') && !line.includes('subagent') && !line.includes('toolCall') && !line.includes('provenance')) continue;
          try {
            const entry = JSON.parse(line);
            const msg = entry.message || entry;

            // Check provenance on user messages (incoming from other agents)
            if (msg.role === 'user' && msg.provenance) {
              const src = msg.provenance.sourceSessionKey || '';
              let senderName = null;
              if (agentNames[src]) senderName = agentNames[src];
              else {
                const parts = src.split(':');
                for (const p of parts) { if (agentNames[p]) { senderName = agentNames[p]; break; } }
              }
              if (senderName && senderName !== fromName) {
                const key = `${senderName}->${fromName}`;
                edges[key] = (edges[key] || 0) + 1;
                nodeSet.add(senderName);
              }
            }

            if (msg.role !== 'assistant' || !msg.content) continue;
            const contents = Array.isArray(msg.content) ? msg.content : [msg.content];
            for (const c of contents) {
              if (typeof c !== 'object') continue;
              // Tool use blocks (Anthropic: tool_use, OpenAI: function, OpenClaw: toolCall)
              const toolName = c.name || c.function?.name || '';
              const isToolBlock = c.type === 'tool_use' || c.type === 'function' || c.type === 'toolCall';
              if (!isToolBlock && !toolName) continue;

              const input = c.input || c.arguments || (c.function?.arguments ? (() => { try { return JSON.parse(c.function.arguments); } catch { return {}; } })() : {});

                let targetName = null;

                if (toolName === 'sessions_send' || toolName === 'sessions_spawn') {
                  // Look for sessionKey, label, agentId
                  const sk = input.sessionKey || input.label || input.agentId || '';
                  // Try to resolve to known agent name
                  if (agentNames[sk]) targetName = agentNames[sk];
                  else {
                    // Try partial match: "agent:coding-agent-1:main" -> "coding-agent-1"
                    const parts = sk.split(':');
                    for (const p of parts) {
                      if (agentNames[p]) { targetName = agentNames[p]; break; }
                    }
                  }
                }

                if (toolName === 'message') {
                  // Messages to Telegram = talking to the user/owner
                  const target = input.target || '';
                  if (target === 'TELEGRAM_USER_ID' || target.includes('TELEGRAM_USER_ID')) {
                    targetName = 'User';
                  }
                }

                if (targetName && targetName !== fromName) {
                  const key = `${fromName}->${targetName}`;
                  edges[key] = (edges[key] || 0) + 1;
                  nodeSet.add(targetName);
                }
            }
          } catch {}
        }
      }
    } catch {}
  }

  // Ensure ALL configured agents appear as nodes (even with no session data)
  for (const a of agents) {
    nodeSet.add(a.name);
  }

  // Auto-generate baseline relationships: no hardcoded agent names
  // Just ensure all agents are nodes; real comm data provides edges
  const baselineRelationships = [];
  for (const [from, to] of baselineRelationships) {
    const key = `${from}->${to}`;
    if (!edges[key]) edges[key] = 0; // baseline = 0 count (shown as dotted)
  }

  // Build result
  const nodes = [];
  for (const name of nodeSet) {
    const a = agents.find(x => x.name === name);
    nodes.push({ name, color: a?.color || '#64748b', role: a?.role || 'Agent' });
  }

  const edgeList = Object.entries(edges).map(([key, count]) => {
    const [from, to] = key.split('->');
    return { from, to, count, baseline: count === 0 };
  }).sort((a, b) => b.count - a.count);

  _commGraphCache = { nodes, edges: edgeList };
  _commGraphCacheTime = now;
  return { ..._commGraphCache, timestamp: now };
}

// --- Live Logs: tail recent messages from all active agents ---
// Agent-specific logs (1h window, 50 entries) for detail panel
function getAgentLogs(agentDir) {
  const now = Date.now();
  const agents = discoverAgents();
  const agent = agents.find(a => a.sessionDir === agentDir);
  if (!agent) return { logs: [], error: 'Agent not found' };

  const sessDir = path.join(AGENTS_DIR, agentDir, 'sessions');
  if (!fs.existsSync(sessDir)) return { logs: [] };

  const WINDOW = 60 * 60 * 1000; // 1 hour
  const SKIP_RE = /^(ANNOUNCE_SKIP|NO_REPLY|undefined|Agent Summary:?)$/i;
  const logs = [];

  try {
    const files = fs.readdirSync(sessDir).filter(f => f.endsWith('.jsonl') && !f.endsWith('.lock'));
    let bestFile = null, bestMtime = 0;
    for (const f of files) {
      const fp = path.join(sessDir, f);
      const st = fs.statSync(fp);
      if (st.mtimeMs > bestMtime) { bestMtime = st.mtimeMs; bestFile = fp; }
    }
    if (!bestFile) return { logs: [] };

    const stat = fs.statSync(bestFile);
    const readSize = Math.min(stat.size, 500000);
    const fd = fs.openSync(bestFile, 'r');
    const buf = Buffer.alloc(readSize);
    fs.readSync(fd, buf, 0, readSize, Math.max(0, stat.size - readSize));
    fs.closeSync(fd);
    const lines = buf.toString('utf8').trim().split('\n');

    for (let i = lines.length - 1; i >= Math.max(0, lines.length - 200); i--) {
      try {
        const entry = JSON.parse(lines[i]);
        const msg = entry.message || entry;
        if (!msg.role || !msg.content) continue;

        let ts = 0;
        if (entry.timestamp) {
          ts = typeof entry.timestamp === 'string' ? new Date(entry.timestamp).getTime() : entry.timestamp;
        }
        if (!ts || (now - ts) > WINDOW) continue;

        const contents = Array.isArray(msg.content) ? msg.content : [msg.content];
        for (const c of contents) {
          const txt = typeof c === 'string' ? c : (c.type === 'text' && c.text ? c.text : '');
          if (!txt || txt.trim().length < 5) continue;
          const cleaned = txt.trim().replace(/[^\x20-\x7E\u00A0-\uFFFF]/g, ' ').replace(/\s+/g, ' ').slice(0, 500);
          if (SKIP_RE.test(cleaned.trim())) continue;

          logs.push({ role: msg.role, text: cleaned, ts });
          break;
        }
      } catch {}
    }
  } catch {}

  logs.sort((a, b) => b.ts - a.ts);
  return { logs: logs.slice(0, 50), agent: agent.name, color: agent.color };
}

let _liveLogsCache = null;
let _liveLogsCacheTime = 0;
const LIVE_LOGS_CACHE_TTL = 10000;

// GitHub-style heatmap calendar: activity per day per agent over last 90 days
let _heatmapCache = null;
let _heatmapCacheTime = 0;
const HEATMAP_CACHE_TTL = 600000; // 10 min — expensive scan

function getHeatmapCalendar() {
  const now = Date.now();
  if (_heatmapCache && (now - _heatmapCacheTime) < HEATMAP_CACHE_TTL) return _heatmapCache;

  const DAYS = 90;
  const agents = discoverAgents();
  const dayMs = 86400000;
  const today = new Date(); today.setHours(0,0,0,0);
  const startDay = new Date(today.getTime() - (DAYS - 1) * dayMs);

  const dates = [];
  for (let i = 0; i < DAYS; i++) {
    dates.push(new Date(startDay.getTime() + i * dayMs).toISOString().slice(0, 10));
  }

  // Lightweight: use file mtimes only (no content reading, no execSync)
  const agentDays = {};
  const totalDays = {};

  for (const agent of agents) {
    const counts = {};
    const sessDir = path.join(AGENTS_DIR, agent.sessionDir, 'sessions');
    try {
      if (fs.existsSync(sessDir)) {
        const files = fs.readdirSync(sessDir).filter(f => f.endsWith('.jsonl'));
        for (const f of files) {
          try {
            const mt = fs.statSync(path.join(sessDir, f)).mtimeMs;
            if (mt < startDay.getTime()) continue;
            // Use both mtime and ctime to get creation+modification days
            const mDay = new Date(mt).toISOString().slice(0, 10);
            if (mDay >= dates[0] && mDay <= dates[dates.length - 1]) {
              counts[mDay] = (counts[mDay] || 0) + 1;
            }
          } catch {}
        }
      }
    } catch {}

    // Also count memory file mtimes (state.md, learnings.md)
    const memDir = path.join(AGENTS_DIR, agent.sessionDir, 'memory');
    try {
      if (fs.existsSync(memDir)) {
        for (const f of fs.readdirSync(memDir)) {
          try {
            const mt = fs.statSync(path.join(memDir, f)).mtimeMs;
            if (mt < startDay.getTime()) continue;
            const mDay = new Date(mt).toISOString().slice(0, 10);
            if (mDay >= dates[0] && mDay <= dates[dates.length - 1]) {
              counts[mDay] = (counts[mDay] || 0) + 1;
            }
          } catch {}
        }
      }
    } catch {}

    if (Object.keys(counts).length > 0) {
      agentDays[agent.name] = { counts, color: agent.color };
    }
    for (const [d, c] of Object.entries(counts)) {
      totalDays[d] = (totalDays[d] || 0) + c;
    }
  }

  const result = { dates, startDay: dates[0], endDay: dates[dates.length - 1], totalDays, agents: agentDays, timestamp: now };
  _heatmapCache = result;
  _heatmapCacheTime = now;
  return result;
}

function getLiveLogs() {
  const now = Date.now();
  if (_liveLogsCache && (now - _liveLogsCacheTime) < LIVE_LOGS_CACHE_TTL) return { ..._liveLogsCache, timestamp: now };

  const agents = discoverAgents();
  const logs = [];
  const WINDOW = 30 * 60 * 1000; // last 30 min
  const SKIP_RE = /^(ANNOUNCE_SKIP|NO_REPLY|undefined|Agent Summary:?)$/i;

  for (const agent of agents) {
    const sessDir = path.join(AGENTS_DIR, agent.sessionDir, 'sessions');
    if (!fs.existsSync(sessDir)) continue;

    try {
      const files = fs.readdirSync(sessDir).filter(f => f.endsWith('.jsonl') && !f.endsWith('.lock'));
      let bestFile = null, bestMtime = 0;
      for (const f of files) {
        const fp = path.join(sessDir, f);
        const st = fs.statSync(fp);
        if (st.mtimeMs > bestMtime) { bestMtime = st.mtimeMs; bestFile = fp; }
      }
      if (!bestFile || (now - bestMtime) > WINDOW) continue;

      const stat = fs.statSync(bestFile);
      const readSize = Math.min(stat.size, 200000);
      const fd = fs.openSync(bestFile, 'r');
      const buf = Buffer.alloc(readSize);
      fs.readSync(fd, buf, 0, readSize, Math.max(0, stat.size - readSize));
      fs.closeSync(fd);
      const lines = buf.toString('utf8').trim().split('\n');

      for (let i = lines.length - 1; i >= Math.max(0, lines.length - 100); i--) {
        try {
          const entry = JSON.parse(lines[i]);
          const msg = entry.message || entry;
          if (!msg.role || !msg.content) continue;

          let ts = 0;
          if (entry.timestamp) {
            ts = typeof entry.timestamp === 'string' ? new Date(entry.timestamp).getTime() : entry.timestamp;
          }
          if (!ts || (now - ts) > WINDOW) continue;

          const contents = Array.isArray(msg.content) ? msg.content : [msg.content];
          for (const c of contents) {
            const txt = typeof c === 'string' ? c : (c.type === 'text' && c.text ? c.text : '');
            if (!txt || txt.trim().length < 5) continue;
            const cleaned = txt.trim().replace(/[^\x20-\x7E\u00A0-\uFFFF]/g, ' ').replace(/\s+/g, ' ').slice(0, 300);
            if (SKIP_RE.test(cleaned.trim())) continue;

            // Detect tool calls
            let toolName = null;
            if (typeof c === 'object' && (c.type === 'tool_use' || c.name)) {
              toolName = c.name || 'tool';
            }

            logs.push({
              agent: agent.name,
              color: agent.color,
              role: msg.role,
              text: cleaned,
              tool: toolName,
              ts,
            });
            break;
          }
        } catch {}
      }
    } catch {}
  }

  logs.sort((a, b) => b.ts - a.ts);
  _liveLogsCache = { logs: logs.slice(0, 80) };
  _liveLogsCacheTime = now;
  return { ..._liveLogsCache, timestamp: now };
}

// ===== AUTH & RATE LIMITING =====
const CONFIG_PATH = path.join(__dirname, 'config.json');
let _config = {};
try { _config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch {}

// Auth: token-based. Set "auth" in config.json: { "auth": { "enabled": true, "tokens": { "admin-key": "admin", "viewer-key": "viewer" } } }
// Roles: admin = full access, viewer = read-only (no POST/DELETE/PUT)
const AUTH = _config.auth || {};
const AUTH_ENABLED = AUTH.enabled === true;
const AUTH_TOKENS = AUTH.tokens || {}; // { token: role }

function authenticate(req) {
  if (!AUTH_ENABLED) return { authenticated: true, role: 'admin' };
  // Check Authorization header: Bearer <token> or X-API-Key header or ?token= query param
  let token = null;
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) token = authHeader.slice(7).trim();
  if (!token) token = req.headers['x-api-key'];
  if (!token) {
    const qIdx = req.url.indexOf('?token=');
    if (qIdx !== -1) token = req.url.slice(qIdx + 7).split('&')[0];
  }
  if (!token || !AUTH_TOKENS[token]) return { authenticated: false, role: null };
  return { authenticated: true, role: AUTH_TOKENS[token] || 'viewer' };
}

// Rate limiting: sliding window per IP
const RATE_LIMIT = _config.rateLimit || {};
const RATE_ENABLED = RATE_LIMIT.enabled !== false; // on by default
const RATE_WINDOW_MS = (RATE_LIMIT.windowSeconds || 60) * 1000;
const RATE_MAX = RATE_LIMIT.maxRequests || 120; // 120 req/min default
const _rateBuckets = new Map(); // ip -> { count, resetTime }

function checkRateLimit(ip) {
  if (!RATE_ENABLED) return true;
  const now = Date.now();
  let bucket = _rateBuckets.get(ip);
  if (!bucket || now > bucket.resetTime) {
    bucket = { count: 0, resetTime: now + RATE_WINDOW_MS };
    _rateBuckets.set(ip, bucket);
  }
  bucket.count++;
  return bucket.count <= RATE_MAX;
}

// Cleanup stale rate limit buckets every 5 min
setInterval(() => {
  const now = Date.now();
  for (const [ip, bucket] of _rateBuckets) {
    if (now > bucket.resetTime) _rateBuckets.delete(ip);
  }
}, 300000);

const STATIC_DIR = __dirname;
const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') { json(res, {}); return; }

  // API versioning: support /api/v1/ prefix (maps to /api/)
  if (req.url.startsWith('/api/v1/')) {
    req.url = req.url.replace('/api/v1/', '/api/');
  }

  const url = req.url.split('?')[0];

  // Rate limiting on API routes
  if (url.startsWith('/api/')) {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
    if (!checkRateLimit(ip)) {
      res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': String(Math.ceil(RATE_WINDOW_MS / 1000)) });
      res.end(JSON.stringify({ error: 'Too many requests', code: 'RATE_LIMITED', retryAfter: Math.ceil(RATE_WINDOW_MS / 1000) }));
      return;
    }

    // Authentication
    const auth = authenticate(req);
    if (!auth.authenticated) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized', code: 'AUTH_REQUIRED', message: 'Provide token via Authorization: Bearer <token>, X-API-Key header, or ?token= query param' }));
      return;
    }
    // RBAC: viewers can only GET
    if (auth.role === 'viewer' && req.method !== 'GET') {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden', code: 'INSUFFICIENT_ROLE', message: 'Viewer role is read-only' }));
      return;
    }
  }

  // SSE endpoint
  if (url === '/api/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'Access-Control-Allow-Origin': '*' });
    res.write(`event: connected\ndata: {"ok":true}\n\n`);
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return;
  }

  // Demo mode: serve mock data for all API endpoints
  if (DEMO_MODE && url.startsWith('/api/') && req.method === 'GET') {
    const handler = DEMO_HANDLERS[url];
    if (handler) return json(res, handler());
    if (url.startsWith('/api/agent-detail/') || url.startsWith('/api/agent-logs/')) return json(res, { logs: [], detail: {} });
  }

  if (url === '/healthz') return json(res, { ok: true, uptime: process.uptime() });
  // ===== DATA EXPORT =====
  if (url.startsWith('/api/export/')) { console.log('[export]', url); }
  if (url === '/api/export/agents') {
    const fmt = (req.url.split('?')[1] || '').includes('format=csv') ? 'csv' : 'json';
    const data = getAgents();
    if (fmt === 'csv') {
      const header = 'name,role,status,color,lastActivity,activityAge\n';
      const rows = (data.agents || []).map(a => `"${a.name}","${a.role}","${a.status}","${a.color}","${String(a.lastActivity||'').replace(/"/g,'""')}",${a.activityAge||0}`).join('\n');
      const body = header + rows;
      res.writeHead(200, { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="agents.csv"', 'Access-Control-Allow-Origin': '*' });
      res.end(body);
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Disposition': 'attachment; filename="agents.json"', 'Access-Control-Allow-Origin': '*' });
    return res.end(JSON.stringify(data, null, 2));
  }
  if (url === '/api/export/tokens') {
    const fmt = (req.url.split('?')[1] || '').includes('format=csv') ? 'csv' : 'json';
    const data = getTokens();
    if (fmt === 'csv') {
      const header = 'agent,model,input,output,cacheRead,cacheWrite,totalCost\n';
      const rows = (data.agents || []).map(a => `"${a.name}","${a.model}",${a.input||0},${a.output||0},${a.cacheRead||0},${a.cacheWrite||0},${a.cost||0}`).join('\n');
      res.writeHead(200, { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="tokens.csv"', 'Access-Control-Allow-Origin': '*' });
      return res.end(header + rows);
    }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Disposition': 'attachment; filename="tokens.json"', 'Access-Control-Allow-Origin': '*' });
    return res.end(JSON.stringify(data, null, 2));
  }
  if (url === '/api/export/activity') {
    const fmt = (req.url.split('?')[1] || '').includes('format=csv') ? 'csv' : 'json';
    const data = getActivity();
    if (fmt === 'csv') {
      const header = 'timestamp,agent,role,text\n';
      const rows = (data.activity || []).map(a => `"${a.ts}","${a.agent}","${a.role||''}","${(a.text||'').replace(/"/g,'""').replace(/\n/g,' ')}"`).join('\n');
      res.writeHead(200, { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="activity.csv"', 'Access-Control-Allow-Origin': '*' });
      return res.end(header + rows);
    }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Disposition': 'attachment; filename="activity.json"', 'Access-Control-Allow-Origin': '*' });
    return res.end(JSON.stringify(data, null, 2));
  }
  if (url === '/api/export/logs') {
    const fmt = (req.url.split('?')[1] || '').includes('format=csv') ? 'csv' : 'json';
    const data = getLiveLogs();
    if (fmt === 'csv') {
      const header = 'timestamp,agent,role,speaker,text\n';
      const rows = (data.logs || []).map(l => `"${l.ts}","${l.agent}","${l.role||''}","${l.speaker||''}","${(l.text||'').replace(/"/g,'""').replace(/\n/g,' ')}"`).join('\n');
      res.writeHead(200, { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="logs.csv"', 'Access-Control-Allow-Origin': '*' });
      return res.end(header + rows);
    }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Disposition': 'attachment; filename="logs.json"', 'Access-Control-Allow-Origin': '*' });
    return res.end(JSON.stringify(data, null, 2));
  }

  // Persistent data endpoints
  if (url === '/api/cost-history') {
    const days = parseInt(new URLSearchParams(req.url.split('?')[1] || '').get('days') || '30');
    const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    return json(res, { history: _stmts.getCostHistory.all(since) });
  }
  if (url === '/api/agent-events') {
    const since = Date.now() - 7 * 86400000; // last 7 days
    return json(res, { events: _stmts.getRecentEvents.all(since) });
  }
  if (url === '/api/metrics') {
    const params = new URLSearchParams(req.url.split('?')[1] || '');
    const key = params.get('key') || 'cpu';
    const hours = parseInt(params.get('hours') || '24');
    const since = Date.now() - hours * 3600000;
    return json(res, { key, data: _stmts.getMetrics.all(key, since) });
  }
  if (url === '/api/db-stats') {
    const tokenCount = db.prepare('SELECT COUNT(*) as c FROM token_snapshots').get();
    const costCount = db.prepare('SELECT COUNT(*) as c FROM cost_history').get();
    const eventCount = db.prepare('SELECT COUNT(*) as c FROM agent_events').get();
    const metricCount = db.prepare('SELECT COUNT(*) as c FROM metrics').get();
    return json(res, { tokens: tokenCount.c, costs: costCount.c, events: eventCount.c, metrics: metricCount.c });
  }

  if (url === '/api/health') return json(res, { ok: true });
  if (url === '/api/health-score') return json(res, getHealthScore());
  if (url === '/api/system') { setImmediate(() => { try { const sys = getSystem(); if (sys.network) sys.netRate = computeNetRate(sys.network); json(res, sys); } catch(e) { json(res, {error:e.message}); } }); return; }
  if (url === '/api/processes') { try { const raw = execSync("ps aux -r | head -8", { encoding: 'utf8', timeout: 3000 }); const lines = raw.trim().split("\n").slice(1, 8); const procs = lines.map(l => { const p = l.trim().split(/\s+/); return { user: p[0], pid: p[1], cpu: p[2], mem: p[3], command: p.slice(10).join(" ").slice(0, 60) }; }); return json(res, { processes: procs }); } catch (e) { return json(res, { processes: [], error: e.message }); } }
  if (url === '/api/agents') { setImmediate(() => { try { json(res, getAgents()); } catch(e) { json(res, {agents:[],error:e.message}); } }); return; }
  if (url === '/api/memory') return json(res, getMemory());
  if (url === '/api/memory/history') return json(res, getMemoryHistory());
  if (url === '/api/tokens') { setImmediate(() => { try { json(res, getTokens()); } catch(e) { json(res, {totals:{input:0,output:0,cached:0},estimatedCostUSD:0,error:e.message}); } }); return; }
  if (url === '/api/calendar') return json(res, getCalendar());
  if (url === '/api/cron') return json(res, getCron());

  if (url === '/api/tokens/daily') { setImmediate(() => { try { json(res, getTokensDaily()); } catch(e) { json(res, {days:[],error:e.message}); } }); return; }
  if (url === '/api/disk-breakdown') { setImmediate(() => { try { json(res, getDiskBreakdown()); } catch(e) { json(res, {entries:[],error:e.message}); } }); return; }
  if (url === '/api/performance') { setImmediate(() => { try { json(res, getPerformance()); } catch(e) { json(res, {agents:[],error:e.message}); } }); return; }
  if (url === '/api/completion-stats') { setImmediate(() => { try { json(res, getCompletionStats()); } catch(e) { json(res, {completed:0,total:0,error:e.message}); } }); return; }
  if (url === '/api/uptime') { setImmediate(() => { try { json(res, getUptime()); } catch(e) { json(res, {agents:[],error:e.message}); } }); return; }
  if (url === '/api/queue' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const d = JSON.parse(body);
        const date = new Date().toISOString().split('T')[0];
        const slug = (d.title || 'untitled').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60);
        const filename = `${date}_${slug}.md`;
        const content = `# WR: ${d.title || 'Untitled'}\n- **ID:** ${filename}\n- **Type:** ${d.type || 'task'}\n- **Priority:** ${d.priority || 'medium'}\n- **Status:** created\n- **Created:** ${new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })}\n- **Owner:** ${d.owner || ''}\n\n## Description\n${d.description || 'No description provided.'}\n`;
        fs.writeFileSync(path.join(WR_DIR, filename), content);
        json(res, { ok: true, file: filename });
      } catch (e) { res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify({ error: e.message })); }
    });
    return;
  }
  if (url === '/api/queue') return json(res, getQueue());
  if (url === '/api/activity') { setImmediate(() => { try { json(res, getActivity()); } catch(e) { json(res, {entries:[],error:e.message}); } }); return; }
  if (url === '/api/timeline') { setImmediate(() => { try { json(res, getActivity()); } catch(e) { json(res, {entries:[],error:e.message}); } }); return; }
  if (url === '/api/timeline-heatmap') { setImmediate(() => { try { json(res, getTimelineHeatmap()); } catch(e) { json(res, {data:[],error:e.message}); } }); return; }
  if (url === '/api/comm-graph') { setImmediate(() => { try { json(res, getCommGraph()); } catch(e) { json(res, {nodes:[],links:[],error:e.message}); } }); return; }
  if (url === '/api/dependency-graph') { setImmediate(() => { try { json(res, getDependencyGraph()); } catch(e) { json(res, {nodes:[],links:[],error:e.message}); } }); return; }
  if (url === '/api/heatmap-calendar') { setImmediate(() => { try { json(res, getHeatmapCalendar()); } catch(e) { json(res, {data:[],error:e.message}); } }); return; }
  if (url === '/api/live-logs') { setImmediate(() => { try { json(res, getLiveLogs()); } catch(e) { json(res, {logs:[],error:e.message}); } }); return; }
  if (url.startsWith('/api/agent-logs/')) {
    const agentDir = decodeURIComponent(url.replace('/api/agent-logs/', ''));
    return json(res, getAgentLogs(agentDir));
  }
  if (url.startsWith('/api/agent-detail/')) {
    const agentDir = decodeURIComponent(url.replace('/api/agent-detail/', ''));
    return json(res, getAgentDetail(agentDir));
  }

  // Wake/trigger agent cron job
  if (url === '/api/wake-agent' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const d = JSON.parse(body);
        const cronJobId = d.cronJobId;
        if (!cronJobId) { res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify({ error: 'Missing cronJobId' })); return; }
        execAsync(`openclaw cron run --id ${cronJobId} --timeout 5000 2>&1`, { timeout: 8000, encoding: 'utf8' }, (err, stdout, stderr) => {
          delete _cronCache[cronJobId];
          _discoveredAgents = null;
          if (err) { json(res, { ok: false, error: (stderr || stdout || err.message || '').slice(0, 200) }); return; }
          json(res, { ok: true, output: (stdout || '').slice(0, 300) });
        });
      } catch (e) { res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify({ error: e.message })); }
    });
    return;
  }

  let filePath = path.join(STATIC_DIR, url === '/' ? 'index.html' : url);
  const ext = path.extname(filePath);
  const mimeTypes = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
  try {
    const content = fs.readFileSync(filePath);
    const headers = { 'Content-Type': mimeTypes[ext] || 'application/octet-stream', 'Access-Control-Allow-Origin': '*' };
    if (ext === '.html') headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
    res.writeHead(200, headers);
    res.end(content);
  } catch { res.writeHead(404); res.end('Not found'); }
});

function warmLightCaches() {
  setImmediate(() => { try { getAgents(); } catch {} });
  setTimeout(() => { setImmediate(() => { try { getActivity(); } catch {} }); }, 500);
  setTimeout(() => { setImmediate(() => { try { getTokens(); } catch {} }); }, 1000);
  setTimeout(() => { setImmediate(() => { try { getLiveLogs(); } catch {} }); }, 1500);
}
function warmHeavyCaches() {
  setImmediate(() => { try { getUptime(); } catch {} });
  setTimeout(() => { setImmediate(() => { try { getTimelineHeatmap(); } catch {} }); }, 1000);
  setTimeout(() => { setImmediate(() => { try { getHeatmapCalendar(); } catch {} }); }, 2000);
}

server.listen(18790, '0.0.0.0', () => {
  console.log(`Agent Space running on :18790 (${DEMO_MODE ? 'DEMO' : 'live'})`);
  // Warm agents cache IMMEDIATELY (synchronous) so first request is fast
  try { getAgents(); } catch {}
  setTimeout(() => { warmLightCaches(); }, 2500);
  setTimeout(() => { warmHeavyCaches(); }, 12000);
  // Background cron cache: first run at 5s, then every 10 min
  setTimeout(() => { _warmCronCacheOnce(); }, 5000);
  setInterval(() => { _warmCronCacheOnce(); }, 600000);
  setInterval(() => {
    if (sseClients.size > 0) warmLightCaches();
  }, 60000); // every 60s (was 30s)
  // Persist snapshots every hour
  setInterval(() => { setImmediate(persistSnapshot); }, 3600000);
  // Initial snapshot after caches warm
  setTimeout(() => { setImmediate(persistSnapshot); }, 20000);
});
