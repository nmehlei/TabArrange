// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 nmehlei
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('extension/background.js', 'utf8');
function harness(initial) {
  const tabs = structuredClone(initial), event = { addListener() {} }, removed = [];
  const chrome = {
    storage: { session: { get: async () => ({ sessionId: 'test-session' }), set: async () => {} }, local: { get: async () => ({ profile: { id: 'test', name: 'Test' } }) }, onChanged: event },
    action: { onClicked: event, setBadgeText: async () => {}, setTitle: async () => {} },
    runtime: { connectNative: () => ({ onDisconnect: event, onMessage: event, postMessage() {} }), onStartup: event, onInstalled: event },
    alarms: { onAlarm: event },
    windows: { getAll: async () => [{ id: 1 }], get: async id => ({ id, type: 'normal', incognito: tabs.some(t => t.windowId === id && t.incognito), tabs: tabs.filter(t => t.windowId === id) }), remove: async id => { for (const t of [...tabs]) if (t.windowId === id) { removed.push(t.id); tabs.splice(tabs.indexOf(t), 1); } }, onCreated: event, onRemoved: event },
    tabGroups: { query: async () => [], onCreated: event, onUpdated: event, onRemoved: event, onMoved: event },
    tabs: { get: async id => { const tab = tabs.find(t => t.id === id); if (!tab) throw new Error('Tab no longer exists'); return { ...tab }; },
      query: async query => tabs.filter(t => query.windowId === undefined || t.windowId === query.windowId),
      remove: async id => { removed.push(id); tabs.splice(tabs.findIndex(t => t.id === id), 1); },
      ...Object.fromEntries(['onCreated', 'onRemoved', 'onUpdated', 'onMoved', 'onActivated', 'onAttached', 'onDetached'].map(name => [name, event])) }
  };
  const context = vm.createContext({ chrome, crypto: require('node:crypto'), setTimeout, clearTimeout, URL });
  vm.runInContext(source, context);
  return { execute: action => context.execute({ sessionId: 'test-session', ...action }), removed };
}
const tab = (id, extra = {}) => ({ id, windowId: 1, url: `https://example.com/${id}`, status: 'complete', ...extra });
const action = tabs => ({ type: 'close', tabs: tabs.map(({ id, url }) => ({ id, url })) });
test('extension refuses an obsolete URL before closing anything', async () => {
  const tabs = [tab(1), tab(2)]; const h = harness(tabs);
  await assert.rejects(h.execute({ type: 'close', tabs: [{ id: 1, url: 'https://old.example/' }] }), /changed/);
  assert.deepEqual(h.removed, []);
});
test('extension preserves protected tabs even when a caller requests their closure', async () => {
  const tabs = [tab(1, { active: true }), tab(2, { pinned: true }), tab(3, { audible: true }), tab(4)];
  const h = harness(tabs); const result = await h.execute(action(tabs));
  assert.deepEqual(h.removed, [4]); assert.equal(result.skipped.length, 3);
});
test('extension rechecks window size during a batch, preserving its last tab', async () => {
  const tabs = [tab(1), tab(2), tab(3)]; const h = harness(tabs);
  const result = await h.execute(action(tabs));
  assert.deepEqual(h.removed, [1, 2]); assert.equal(result.skipped.length, 1);
});
test('extension rejects pending navigation and incognito tabs', async () => {
  for (const extra of [{ pendingUrl: 'https://next.example/' }, { incognito: true }]) {
    const tabs = [tab(1, extra), tab(2)]; const h = harness(tabs);
    await assert.rejects(h.execute(action(tabs)), /changed/); assert.deepEqual(h.removed, []);
  }
});
test('extension refuses old session IDs', async () => {
  const tabs = [tab(1), tab(2)], h = harness(tabs);
  await assert.rejects(h.execute({ ...action(tabs), sessionId: 'previous-session' }), /restarted/); assert.deepEqual(h.removed, []);
});
test('automatic cleanup skips a duplicate when its survivor disappears', async () => {
  const tabs = [tab(1), tab(2)], h = harness(tabs);
  const result = await h.execute({ ...action([tabs[0]]), automatic: true, survivors: [{ id: 99, url: tabs[0].url }] });
  assert.equal(result.count, 0); assert.deepEqual(h.removed, []);
});
test('keep-domain rule also protects subdomains at execution time', async () => {
  const tabs = [tab(1, { url: 'https://mail.example.com/inbox' }), tab(2, { url: 'https://other.test/' })], h = harness(tabs);
  const result = await h.execute({ ...action(tabs), protections: { keepDomains: ['example.com'] } });
  assert.deepEqual(h.removed, [2]); assert.equal(result.skipped[0].reason, 'Always-keep domain');
});

test('window closure requires the exact confirmed contents and current session', async () => {
  const tabs = [tab(1), tab(2)], h = harness(tabs);
  const close = { ...action(tabs), type: 'close-window', windowId: 1 };
  await assert.rejects(h.execute({ ...close, tabs: [close.tabs[0]] }), /changed/);
  await assert.rejects(h.execute({ ...close, sessionId: 'old' }), /restarted/);
  assert.deepEqual(h.removed, []);
});
test('explicit window closure includes protected tabs and records every closure', async () => {
  const tabs = [tab(1, { active: true }), tab(2, { pinned: true }), tab(3, { windowId: 2 })], h = harness(tabs);
  const result = await h.execute({ ...action(tabs.slice(0, 2)), type: 'close-window', windowId: 1 });
  assert.deepEqual(h.removed, [1, 2]); assert.equal(result.closed.length, 2);
});
test('window closure rejects incognito and pending navigation', async () => {
  for (const extra of [{ incognito: true }, { pendingUrl: 'https://new.test' }]) {
    const tabs = [tab(1, extra)], h = harness(tabs);
    await assert.rejects(h.execute({ ...action(tabs), type: 'close-window', windowId: 1 }));
    assert.deepEqual(h.removed, []);
  }
});
