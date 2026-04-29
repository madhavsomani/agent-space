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
const code = ['normalizeEventTs', 'normalizeSessionHistoryItems', 'getSessionKey']
  .map(name => extractFunction(source, name))
  .join('\n') + '\n({ normalizeSessionHistoryItems, getSessionKey });';
const context = { Date, Number, String, JSON };
vm.createContext(context);
const { normalizeSessionHistoryItems, getSessionKey } = vm.runInContext(code, context);

assert.equal(getSessionKey({ sessionKey: 'agent:writer:main' }), 'agent:writer:main');
assert.equal(getSessionKey({ id: 'abc', name: 'Fallback' }), 'abc');

const items = normalizeSessionHistoryItems({ data: { messages: [
  { role: 'user', content: 'hello', createdAt: '2026-04-29T06:03:00Z' },
  { type: 'assistant', text: 'hi there' },
  { role: 'tool_result', toolName: 'read', output: { ok: true } },
] } });
assert.equal(items.length, 3);
assert.equal(items[0].role, 'user');
assert.equal(items[0].text, 'hello');
assert.equal(items[2].role, 'tool');
assert.equal(items[2].label, 'read');
assert.match(items[2].text, /ok/);

const wrapped = normalizeSessionHistoryItems({ history: [{ author: 'system', message: 'boot' }] });
assert.equal(wrapped[0].role, 'system');
assert.equal(wrapped[0].text, 'boot');

console.log('session history tests passed');
