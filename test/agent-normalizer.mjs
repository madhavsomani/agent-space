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
const code = ['esc', 'sanitizeAgentText', 'normalizeGatewayStatus', 'normalizeGatewayTimestamp', 'normalizeGatewayAgent', 'normalizeGatewayAgents']
  .map((name) => extractFunction(source, name))
  .join('\n') + '\n({ normalizeGatewayAgent, normalizeGatewayAgents });';

const context = {
  document: { createElement: () => ({ textContent: '', innerHTML: '' }) },
  Date,
};
vm.createContext(context);
const { normalizeGatewayAgent, normalizeGatewayAgents } = vm.runInContext(code, context);

const now = Date.now();
const agent = normalizeGatewayAgent({
  sessionKey: 'agent:writer:main',
  label: 'Writer',
  status: 'active',
  kind: 'persistent',
  updatedAt: new Date(now - 120000).toISOString(),
  lastMessage: 'Drafting copy',
}, now);
assert.equal(agent.name, 'Writer');
assert.equal(agent.status, 'working');
assert.equal(agent.sessionType, 'persistent');
assert.equal(agent.ageMin, 2);
assert.equal(agent.lastMessage, 'Drafting copy');

const wrapped = normalizeGatewayAgents({ data: { sessions: [{ name: 'QA', state: 'idle', type: 'cron' }] } }, now);
assert.equal(wrapped.length, 1);
assert.equal(wrapped[0].name, 'QA');
assert.equal(wrapped[0].status, 'idle');
assert.equal(wrapped[0].sessionType, 'cron');

console.log('agent normalizer tests passed');
