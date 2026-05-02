#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} not found`);
  let depth = 0;
  let end = start;
  let opened = false;
  for (; end < source.length; end++) {
    const ch = source[end];
    if (ch === '{') { depth++; opened = true; }
    if (ch === '}') { depth--; if (opened && depth === 0) { end++; break; } }
  }
  return source.slice(start, end);
}

const source = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const code = ['normalizeEventTs', 'normalizeActivityTimelineEvents', 'formatDuration']
  .map(name => extractFunction(source, name))
  .join('\n') + '\n({ normalizeEventTs, normalizeActivityTimelineEvents, formatDuration });';
const context = { Date, Number, Math, String, Map };
vm.createContext(context);
const { normalizeEventTs, normalizeActivityTimelineEvents, formatDuration } = vm.runInContext(code, context);

const now = Date.parse('2026-04-29T05:53:00Z');
assert.equal(normalizeEventTs(now / 1000), now);
assert.equal(formatDuration(125000), '2m');
assert.equal(formatDuration(5400000), '1h 30m');

const events = normalizeActivityTimelineEvents([
  { ts: new Date(now - 60000).toISOString(), agent: 'Writer', text: 'Drafted copy', type: 'agent', startedAt: now - 360000, endedAt: now - 60000 },
  { timestamp: new Date(now - 60000).toISOString(), agentName: 'Writer', message: 'Drafted copy', type: 'agent' },
  { ts: new Date(now - 25 * 3600000).toISOString(), agent: 'Old', text: 'too old' },
], [
  { createdAt: new Date(now - 120000).toISOString(), sessionKey: 'agent:qa:main', event: 'review', detail: 'QA pass', durationMs: 300000 }
], now);

assert.equal(events.length, 2);
assert.equal(events[0].agent, 'Writer');
assert.equal(events[0].durationMs, 300000);
assert.equal(events[1].agent, 'agent:qa:main');
assert.equal(events[1].text, 'review: QA pass');

console.log('activity timeline tests passed');
