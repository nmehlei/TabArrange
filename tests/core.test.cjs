const { test } = require('node:test');
const assert = require('node:assert/strict');
const { encode, decoder } = require('../src/protocol.cjs');
test('native messaging handles fragmented and coalesced UTF-8 frames', () => {
  const output = [], read = decoder(value => output.push(value));
  const bytes = Buffer.concat([encode({ title: 'Kopfhörer 🎧' }), encode({ id: 42 })]);
  for (const byte of bytes) read(Buffer.from([byte]));
  assert.deepEqual(output, [{ title: 'Kopfhörer 🎧' }, { id: 42 }]);
});
test('native messaging rejects oversized frames before buffering their body', () => {
  const header = Buffer.alloc(4); header.writeUInt32LE(20 * 1024 * 1024);
  assert.throws(() => decoder(() => {})(header), /too large/);
});
test('duplicates stay within profiles and preserve URL query and fragment distinctions', async () => {
  const { duplicateKeys } = await import('../src/model.mjs');
  const tabs = [
    { id: 1, profileId: 'a', url: 'https://example.com/?q=1#one' },
    { id: 2, profileId: 'a', url: 'https://example.com/?q=1#one' },
    { id: 3, profileId: 'a', url: 'https://example.com/?q=2#one' },
    { id: 4, profileId: 'b', url: 'https://example.com/?q=1#one' },
    { id: 5, profileId: 'a', url: 'https://example.com/?q=1#two' }
  ];
  assert.deepEqual([...duplicateKeys(tabs)], ['a:1', 'a:2']);
});
test('empty-tab detection never treats missing metadata or pending navigation as empty', async () => {
  const { isEmpty } = await import('../src/model.mjs');
  assert.equal(isEmpty({ url: '' }), false);
  assert.equal(isEmpty({ url: 'about:blank', pendingUrl: 'https://example.com' }), false);
  assert.equal(isEmpty({ url: 'chrome://newtab/', status: 'loading' }), false);
  assert.equal(isEmpty({ url: 'chrome://newtab/', status: 'complete' }), true);
});
test('search combines title and URL terms and respects window filters', async () => {
  const { flatten, demoProfiles, filterTabs } = await import('../src/model.mjs');
  const tabs = flatten(demoProfiles());
  assert.equal(filterTabs(tabs, 'MYDEALZ', { type: 'all' }).length, 4);
  assert.equal(filterTabs(tabs, 'mydealz sony', { type: 'all' }).length, 1);
  assert.equal(filterTabs(tabs, 'mydealz', { type: 'window', windowId: 2 }).length, 2);
});
test('close protection is profile-aware and preserves final window tabs', async () => {
  const { closeReason } = await import('../src/model.mjs');
  const tab = { id: 1, profileId: 'a', windowId: 1 };
  assert.equal(closeReason(tab, [tab, { id: 2, profileId: 'b', windowId: 1 }]), 'Last tab in window');
  assert.equal(closeReason({ ...tab, active: true }, [tab]), 'Active tab');
  assert.equal(closeReason({ ...tab, pinned: true }, [tab]), 'Pinned tab');
});

test('duplicates cluster interleaved copies and search retains differently titled copies', async () => {
  const { filterTabs } = await import('../src/model.mjs');
  const tabs = [
    { id: 1, profileId: 'a', title: 'Unique search phrase', url: 'https://a.test' },
    { id: 2, profileId: 'a', title: 'Other', url: 'https://b.test' },
    { id: 3, profileId: 'a', title: 'Changed title', url: 'https://a.test' },
    { id: 4, profileId: 'a', title: 'Other copy', url: 'https://b.test' },
    { id: 5, profileId: 'b', title: 'Unique search phrase', url: 'https://a.test' }
  ];
  assert.deepEqual(filterTabs(tabs, '', { type: 'duplicates' }).map(t => t.id), [1, 3, 2, 4]);
  assert.deepEqual(filterTabs(tabs, 'Unique search', { type: 'duplicates' }).map(t => t.id), [1, 3]);
});
