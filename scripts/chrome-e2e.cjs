// Real Chrome integration using ONLY isolated Chrome-for-Testing profiles and synthetic pages.
const { app } = require('electron');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), http = require('node:http');
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chr-'));
process.env.CHR_ORGANIZER_DATA_DIR = path.join(root, 'app');
app.setPath('userData', path.join(root, 'electron'));
const { register } = require('../src/installation.cjs');
const { id: extensionId } = require('../src/extension-id.json');
let browsers = [], server, testRegistry;
const timeout = setTimeout(() => fail(new Error('Chrome E2E timed out')), 120000);
async function cleanup() {
  clearTimeout(timeout);
  for (const browser of browsers) await browser.close().catch(() => {});
  server?.close();
  if (testRegistry) try { execFileSync('reg', ['delete', testRegistry, '/f'], { windowsHide: true }); } catch {}
}
async function fail(error) { console.error(error); await cleanup(); app.exit(1); }
app.on('browser-window-created', (_event, window) => {
  window.hide();
  window.webContents.once('did-finish-load', async () => {
    try {
      const { default: puppeteer } = await import('puppeteer');
      server = http.createServer((req, res) => { if (req.url === '/favicon.png') { res.writeHead(200, { 'Content-Type': 'image/png' }); res.end(fs.readFileSync(path.resolve(__dirname, '../build/icon.png'))); return; } res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(`<html><head><title>Test ${req.url}</title><link rel="icon" href="/favicon.png"></head><body>Disposable TabArrange test page</body></html>`); });
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
      const base = `http://127.0.0.1:${server.address().port}`;
      const packaged = process.argv.includes('--packaged-host');
      const executable = process.platform === 'darwin' ? path.resolve(`dist/mac${process.arch === 'arm64' ? '-arm64' : ''}/TabArrange.app/Contents/MacOS/TabArrange`) : path.resolve('dist/win-unpacked/TabArrange.exe');
      const hostOptions = packaged ? { app: { isPackaged: true }, executable } : {};
      let extensionPath = packaged ? (process.platform === 'darwin' ? path.resolve(path.dirname(executable), '../Resources/extension') : path.resolve(path.dirname(executable), 'resources/extension')) : path.resolve(__dirname, '../extension');
      if (process.platform === 'win32') {
        const bundledPath = extensionPath; extensionPath = path.join(root, 'extension'); fs.cpSync(bundledPath, extensionPath, { recursive: true });
        const name = 'org.chrorganizer.test_' + Date.now();
        const file = path.join(extensionPath, 'background.js'); fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replaceAll('org.chrorganizer.bridge', name));
        const destination = path.join(root, 'native.json'); register({ ...hostOptions, destination, dataDirectory: process.env.CHR_ORGANIZER_DATA_DIR, test: true });
        const manifest = JSON.parse(fs.readFileSync(destination)); manifest.name = name; fs.writeFileSync(destination, JSON.stringify(manifest));
        testRegistry = `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${name}`;
        execFileSync('reg', ['add', testRegistry, '/ve', '/t', 'REG_SZ', '/d', destination, '/f'], { windowsHide: true });
      }
      const launch = async folder => {
        const userDataDir = path.join(root, folder);
        if (process.platform !== 'win32') register({ ...hostOptions, destination: path.join(userDataDir, 'NativeMessagingHosts/org.chrorganizer.bridge.json'), dataDirectory: process.env.CHR_ORGANIZER_DATA_DIR, test: true });
        const browser = await puppeteer.launch({ headless: true, pipe: true, userDataDir, enableExtensions: [extensionPath], args: ['--no-first-run'] }); browsers.push(browser);
        const target = await browser.waitForTarget(t => t.type() === 'service_worker' && t.url() === `chrome-extension://${extensionId}/background.js`);
        const worker = await target.worker();
        await worker.evaluate(async () => { await connect(); });
        return { browser, worker };
      };
      const evaluate = (fn, ...args) => window.webContents.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`);
      const wait = async (fn, timeout = 15000) => { const deadline = Date.now() + timeout; while (!await fn()) { if (Date.now() > deadline) throw new Error('Condition timed out'); await new Promise(resolve => setTimeout(resolve, 50)); } };
      const first = await launch('chrome-a');
      await wait(() => evaluate(async () => (await window.chromeBridge.profiles()).length === 1));
      const fixture = await first.worker.evaluate(async base => {
        const w1 = await chrome.windows.create({ url: base + '/keep-one', focused: false });
        const a = await chrome.tabs.create({ windowId: w1.id, url: base + '/duplicate', active: false });
        const blank = await chrome.tabs.create({ windowId: w1.id, url: 'about:blank', active: false });
        const w2 = await chrome.windows.create({ url: base + '/keep-two', focused: false });
        const b = await chrome.tabs.create({ windowId: w2.id, url: base + '/duplicate', active: false });
        const c = await chrome.tabs.create({ windowId: w2.id, url: base + '/group-me', active: false });
        return { w1: w1.id, w2: w2.id, a: a.id, b: b.id, c: c.id, blank: blank.id };
      }, base);
      await wait(() => first.worker.evaluate(async ids => (await chrome.tabs.query({})).filter(t => ids.includes(t.id)).every(t => t.status === 'complete'), [fixture.a, fixture.b, fixture.c]));
      await first.worker.evaluate(async () => sendSnapshot());
      await wait(() => evaluate(async id => (await window.chromeBridge.profiles())[0].tabs.some(t => t.id === id), fixture.c));
      const profile = (await evaluate(async () => window.chromeBridge.profiles()))[0];
      const act = async (type, ids, extra = {}) => {
        const tabs = await first.worker.evaluate(async ids => Promise.all(ids.map(id => chrome.tabs.get(id))), ids);
        return evaluate(async (profileId, action) => window.chromeBridge.command(profileId, action), profile.id, { type, sessionId: profile.sessionId, tabs: tabs.map(({ id, url }) => ({ id, url })), ...extra });
      };
      await wait(() => first.worker.evaluate(async id => !!(await chrome.tabs.get(id)).favIconUrl, fixture.a));
      const icons = await act('favicons', [fixture.a]);
      assert.match(icons.icons[0].data, /^data:image\/png;base64,/, 'Chrome cached favicon missing');
      await wait(() => evaluate(() => [...document.querySelectorAll('.tab-favicon')].some(img => img.src.startsWith('data:image/png;') && img.naturalWidth > 0)));
      assert.equal((await act('group', [fixture.a, fixture.c], { windowId: fixture.w1, title: 'E2E group' })).count, 2);
      const grouped = await first.worker.evaluate(async id => chrome.tabs.get(id), fixture.c);
      assert.equal(grouped.windowId, fixture.w1); assert.notEqual(grouped.groupId, -1);
      await first.worker.evaluate(async groupId => { await chrome.tabGroups.update(groupId, { color: 'red' }); await sendSnapshot(); }, grouped.groupId);
      await wait(() => evaluate(() => !!document.querySelector('.nav-group[data-group-color="red"]') && !!document.querySelector('.group-chip[data-group-color="red"]')));

      assert.equal((await act('move', [fixture.c], { windowId: fixture.w2 })).count, 1);
      const closed = await act('close', [fixture.b, fixture.blank]); assert.equal(closed.count, 2);
      const history = await evaluate(async () => window.chromeBridge.history()); assert.equal(history[0].tabs.filter(t => t.status === 'closed').length, 2);
      const restored = await evaluate(async batch => window.chromeBridge.recover(batch, false), closed.batchId); assert.equal(restored.count, 2);
      assert.equal((await evaluate(async batch => window.chromeBridge.recover(batch, false), closed.batchId)).count, 0, 'Recovery must not duplicate already restored records');
      await assert.rejects(evaluate(async (id, action) => window.chromeBridge.command(id, action), profile.id, { type: 'close', sessionId: 'old-session', tabs: [{ id: fixture.a, url: base + '/duplicate' }] }), /restarted/);
      await first.worker.evaluate(async () => { port.disconnect(); port = undefined; await connect(); });
      await wait(() => evaluate(async () => (await window.chromeBridge.profiles()).length === 1));
      await launch('chrome-b');
      await wait(() => evaluate(async () => (await window.chromeBridge.profiles()).length === 2));
      await evaluate(async id => window.chromeBridge.command(id, { type: 'rename', name: 'E2E Personal' }), profile.id);
      await wait(() => evaluate(async () => (await window.chromeBridge.profiles()).some(p => p.name === 'E2E Personal')));
      const disposable = await first.worker.evaluate(async base => {
        const window = await chrome.windows.create({ url: base + '/window-close', focused: false });
        await sendSnapshot(); return window.id;
      }, base);
      await wait(() => first.worker.evaluate(async id => (await chrome.tabs.query({ windowId: id })).every(t => t.status === 'complete'), disposable));
      await first.worker.evaluate(async () => sendSnapshot());
      await wait(() => evaluate(async (id, wid) => (await window.chromeBridge.profiles()).find(p => p.id === id).windows.some(w => w.id === wid), profile.id, disposable));
      const windowAction = await evaluate(async (id, wid) => {
        const p = (await window.chromeBridge.profiles()).find(p => p.id === id);
        return { sessionId: p.sessionId, windowId: wid, tabs: p.tabs.filter(t => t.windowId === wid).map(({ id, url }) => ({ id, url })) };
      }, profile.id, disposable);
      await evaluate(async (id, action) => window.chromeBridge.command(id, { ...action, type: 'focus-window' }), profile.id, windowAction);
      assert.equal(await first.worker.evaluate(async id => (await chrome.windows.get(id)).focused, disposable), true);
      const windowClosed = await evaluate(async (id, action) => window.chromeBridge.command(id, { ...action, type: 'close-window' }), profile.id, windowAction);
      assert.equal(windowClosed.count, 1);
      assert.equal(await first.worker.evaluate(async id => (await chrome.windows.getAll()).some(w => w.id === id), disposable), false);
      assert.equal((await evaluate(async batch => window.chromeBridge.recover(batch, false), windowClosed.batchId)).count, 1);
      console.log('Real Chrome E2E passed: two isolated profiles, live inventory, cross-window grouping/moving, close, recovery, idempotent recovery, stale-session rejection, reconnection, and profile rename.');
      await cleanup(); app.quit();
    } catch (error) { await fail(error); }
  });
});
require('../src/main.cjs');
