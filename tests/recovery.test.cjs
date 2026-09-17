// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 nmehlei
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { Store } = require('../src/store.cjs');
const { validateAction, validSnapshot } = require('../src/validation.cjs');
function store() { return new Store(fs.mkdtempSync(path.join(os.tmpdir(), 'chr-store-test-'))); }
test('recovery preserves confirmed closures and marks interrupted outcomes uncertain', () => {
  const s = store(), id = s.begin({ id: 'p', name: 'Personal', sessionId: 's' }, [{ id: 1, url: 'https://one.test' }, { id: 2, url: 'https://two.test' }]);
  s.progress(id, { closed: [{ id: 1, url: 'https://one.test' }] });
  const reloaded = new Store(path.dirname(s.file));
  assert.deepEqual(reloaded.history()[0].tabs.map(t => t.status), ['closed', 'uncertain']);
});
test('recovery does not mark skipped tabs as closed and expires old records', () => {
  const s = store(), id = s.begin({ id: 'p' }, [{ id: 1, url: 'https://one.test' }]);
  s.progress(id, { skipped: [{ id: 1, reason: 'Pinned' }] }); s.finish(id);
  assert.equal(s.history()[0].tabs[0].status, 'skipped');
  s.state.batches[0].time = Date.now() - 31 * 86400000; assert.equal(s.history().length, 0);
});
test('preferences reject URLs masquerading as domain rules', () => {
  const s = store(); assert.throws(() => s.settings({ ...s.settings(), keepDomains: ['https://example.com'] }), /domains/);
  assert.deepEqual(s.settings({ ...s.settings(), keepDomains: ['EXAMPLE.COM', 'example.com'] }).keepDomains, ['example.com']);
});
test('commands reject stale browser sessions even when tab IDs and URLs are reused', () => {
  const profile = { sessionId: 'new', tabs: [{ id: 1, url: 'https://example.com' }] };
  assert.throws(() => validateAction({ type: 'close', sessionId: 'old', tabs: profile.tabs }, profile), /restarted/);
});
test('snapshot validation rejects duplicate IDs and malformed metadata', () => {
  const m = { profile: { id: 'p', name: 'P' }, sessionId: 's', windows: [{ id: 1 }], groups: [], tabs: [{ id: 1, windowId: 1, url: '', title: '' }] };
  assert.equal(validSnapshot(m), true); m.tabs.push(m.tabs[0]); assert.equal(validSnapshot(m), false);
});
test('cleanup keeps a survivor, grouped tabs and keep-domain tabs', async () => {
  const { cleanupPlan, defaultSettings } = await import('../src/model.mjs');
  const tabs = [1, 2, 3].map(id => ({ id, profileId: 'p', windowId: 1, groupId: -1, url: 'https://example.com', lastAccessed: id }));
  assert.deepEqual(cleanupPlan(tabs).candidates.map(t => t.id), [2, 1]);
  tabs[0].groupId = 42;
  assert.deepEqual(cleanupPlan(tabs).candidates.map(t => t.id), [3, 2]);
  assert.equal(cleanupPlan(tabs, { ...defaultSettings, keepDomains: ['example.com'] }).candidates.length, 0);
});
test('cleanup never closes all blank tabs when active protection is disabled', async () => {
  const { cleanupPlan, defaultSettings } = await import('../src/model.mjs');
  const tabs = [1, 2, 3].map(id => ({ id, profileId: 'p', windowId: 1, groupId: -1, url: 'about:blank' }));
  assert.equal(cleanupPlan(tabs, { ...defaultSettings, protectActive: false }).candidates.length, 2);
});
test('journal replay ignores events already committed in a snapshot', () => {
  const s = store(), id = s.begin({ id: 'p' }, [{ id: 1, url: 'https://one.test' }]);
  s.progress(id, { closed: [{ id: 1, url: 'https://one.test' }] });
  const oldLog = fs.readFileSync(s.log);
  s.state.batches[0].tabs[0].status = 'restored'; s.save();
  fs.writeFileSync(s.log, oldLog); // Crash after snapshot rename but before WAL truncation.
  const reloaded = new Store(path.dirname(s.file)); assert.equal(reloaded.history()[0].tabs[0].status, 'restored');
});
test('interrupted journal append leaves unconfirmed closures uncertain', () => {
  const s = store(); s.begin({ id: 'p' }, [{ id: 1, url: 'https://one.test' }]);
  fs.appendFileSync(s.log, '{"sequence":');
  const reloaded = new Store(path.dirname(s.file)); assert.equal(reloaded.history()[0].tabs[0].status, 'uncertain');
});

test('confirmation preferences persist independently and can be reenabled', () => {
  const s = store();
  assert.equal(s.settings().confirmTabClose, true);
  s.settings({ ...s.settings(), confirmTabClose: false });
  const reloaded = new Store(path.dirname(s.file));
  assert.equal(reloaded.settings().confirmTabClose, false);
  assert.equal(reloaded.settings().confirmWindowClose, true);
  reloaded.settings({ ...reloaded.settings(), confirmTabClose: true });
  assert.equal(new Store(path.dirname(s.file)).settings().confirmTabClose, true);
});
