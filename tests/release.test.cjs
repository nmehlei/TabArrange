const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { applyVersion } = require('../scripts/version.cjs');
const publish = require('../scripts/publish-release.cjs');
function directory(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tabarrange-release-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
test('version stamping keeps desktop, lockfile, and Chrome preview versions consistent', t => {
  const root = directory(t);
  fs.mkdirSync(path.join(root, 'extension'));
  const files = { 'package.json': { version: '0.3.0' }, 'package-lock.json': { version: '0.3.0', packages: { '': { version: '0.3.0' } } }, 'extension/manifest.json': { version: '0.3.0', key: 'stable-public-key' } };
  for (const [name, value] of Object.entries(files)) fs.writeFileSync(path.join(root, name), JSON.stringify(value));
  applyVersion('0.4.1-example.2', root);
  const read = name => JSON.parse(fs.readFileSync(path.join(root, name)));
  assert.equal(read('package.json').version, '0.4.1-example.2');
  assert.equal(read('package-lock.json').packages[''].version, '0.4.1-example.2');
  assert.deepEqual(read('extension/manifest.json'), { version: '0.4.1', version_name: '0.4.1-example.2', key: 'stable-public-key' });
  for (const invalid of ['0.0.0', '1.65536.0', '01.2.3', 'garbage']) assert.throws(() => applyVersion(invalid, root));
  assert.equal(read('package.json').version, '0.4.1-example.2');
});
function fixture(t, options = {}) {
  const dir = directory(t), calls = [];
  for (const name of ['mac-arm64.dmg', 'mac-arm64.zip', 'mac-x64.dmg', 'mac-x64.zip', 'win-x64.exe']) fs.writeFileSync(path.join(dir, `TabArrange-0.3.1-${name}`), name);
  fs.writeFileSync(path.join(dir, 'TabArrange-Bridge-0.3.1.zip'), 'extension');
  const missing = () => { throw Object.assign(new Error('Not found'), { status: 404 }); };
  const github = { rest: {
    git: { getRef: async () => options.ref ? { data: { object: { type: 'commit', sha: options.ref } } } : missing(), createRef: async args => calls.push(['tag', args]) },
    repos: {
      getReleaseByTag: async () => options.release ? { data: options.release } : missing(),
      generateReleaseNotes: async () => ({ data: { body: 'Notes' } }),
      createRelease: async args => { calls.push(['draft', args]); return { data: { id: 1, draft: true } }; },
      listReleaseAssets: () => {},
      deleteReleaseAsset: async args => calls.push(['delete', args]),
      uploadReleaseAsset: async args => { calls.push(['upload', args]); if (options.failUpload) throw new Error('Upload failed'); },
      updateRelease: async args => calls.push(['publish', args])
    }
  }, paginate: async () => options.assets || [] };
  return { dir, calls, run: () => publish({ github, context: { repo: { owner: 'personal', repo: 'TabArrange' }, sha: 'tested-sha' }, core: { notice() {} }, version: '0.3.1', directory: dir }) };
}
test('release publishes only after all six artifacts and checksums upload', async t => {
  const f = fixture(t); await f.run();
  assert.deepEqual(f.calls.map(([kind]) => kind), ['tag', 'draft', ...Array(7).fill('upload'), 'publish']);
  assert.equal(f.calls[0][1].sha, 'tested-sha');
  assert.equal(f.calls[1][1].draft, true);
  assert.equal(f.calls.at(-1)[1].draft, false);
  const sums = fs.readFileSync(path.join(f.dir, 'SHA256SUMS.txt'), 'utf8').trim().split('\n');
  assert.equal(sums.length, 6); assert.ok(sums.every(line => /^[a-f0-9]{64}  TabArrange/.test(line)));
});
test('missing artifacts cannot create a release or tag', async t => {
  const f = fixture(t); fs.unlinkSync(path.join(f.dir, 'TabArrange-Bridge-0.3.1.zip'));
  await assert.rejects(f.run()); assert.deepEqual(f.calls, []);
});
test('upload failure leaves draft unpublished; a retry replaces existing draft assets', async t => {
  const failed = fixture(t, { failUpload: true });
  await assert.rejects(failed.run(), /Upload failed/);
  assert.ok(!failed.calls.some(([kind]) => kind === 'publish'));
  const retry = fixture(t, { ref: 'tested-sha', release: { id: 1, draft: true }, assets: [{ id: 7, name: 'TabArrange-0.3.1-mac-arm64.dmg' }] });
  await retry.run();
  assert.equal(retry.calls[0][0], 'delete'); assert.equal(retry.calls.at(-1)[0], 'publish');
  assert.ok(!retry.calls.some(([kind]) => kind === 'tag' || kind === 'draft'));
});
test('published versions and tags belonging to earlier commits remain untouched', async t => {
  for (const options of [{ ref: 'earlier-sha' }, { ref: 'tested-sha', release: { id: 1, draft: false } }]) {
    const f = fixture(t, options); await f.run(); assert.deepEqual(f.calls, []);
  }
});
