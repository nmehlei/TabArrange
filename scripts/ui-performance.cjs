const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
app.setPath('userData', require('node:fs').mkdtempSync(path.join(require('node:os').tmpdir(), 'chr-performance-')));
app.disableHardwareAcceleration();
const profile = { id: 'performance', sessionId: 'test', name: 'Large workspace', windows: Array.from({ length: 50 }, (_, i) => ({ id: 968302518 + i })), groups: [], tabs: Array.from({ length: 5000 }, (_, i) => ({ id: i + 1, title: `Research tab ${i + 1}`, url: `https://example.test/topic/${i + 1}`, windowId: 968302518 + Math.floor(i / 100), groupId: -1, active: i % 100 === 0, status: 'complete' })) };
let window, faviconSupported = false, faviconRequests = 0;
const favicon = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6X2sAAAAASUVORK5CYII=';
async function waitFor(expression, label) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (await window.webContents.executeJavaScript(expression)) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Timed out waiting for ' + label);
}
app.whenReady().then(async () => {
  ipcMain.handle('profiles', () => [profile]);
  ipcMain.handle('command', (_event, _profileId, action) => {
    if (action.type !== 'favicons') return {};
    faviconRequests++;
    if (!faviconSupported) throw new Error('Unknown command');
    return { icons: action.tabs.map(tab => ({ id: tab.id, data: favicon })) };
  });
  ipcMain.handle('settings', () => ({ keepDomains: [], protectActive: true, protectPinned: true, protectAudible: true, retentionDays: 30 }));
  window = new BrowserWindow({ show: false, width: 1280, height: 850, webPreferences: { backgroundThrottling: false, preload: path.resolve(__dirname, '../src/preload.cjs'), sandbox: true, contextIsolation: true } });
  window.webContents.on('console-message', event => console.log('Renderer:', event.message));
  await window.loadFile(path.resolve(__dirname, '../src/index.html'));
  await waitFor(`!document.querySelector('#favicon-notice').hidden && document.querySelector('#favicon-notice').textContent.includes('Reload')`, 'extension reload guidance');
  if (faviconRequests !== 1) throw new Error('Failed favicon request was retried without backoff');
  faviconSupported = true;
  window.webContents.send('profiles', []);
  await waitFor(`document.querySelectorAll('.tab-row').length === 0`, 'profile disconnect');
  window.webContents.send('profiles', [profile]);
  await waitFor(`!!document.querySelector('.tab-favicon') && document.querySelector('#favicon-notice').hidden`, 'favicons after reconnect');
  const metrics = await window.webContents.executeJavaScript(`(async () => {
    const assert = (value, label) => { if (!value) { console.error(label); throw new Error(label); } };
    assert(document.querySelector('.window-icon').parentElement.textContent.startsWith('Window 1'), 'Internal window ID leaked into sidebar');
    assert(!document.querySelector('.location').textContent.includes('968302518'), 'Internal window ID leaked into row');
    assert(document.querySelector('#result-count').textContent === '5000 of 5000 tabs', 'Large fixture missing');
    assert(document.querySelectorAll('.tab-row').length < 50, 'List is not virtualized');
    const nav = document.querySelector('#navigation');
    assert(nav.scrollHeight > nav.clientHeight, 'Sidebar overflow fixture missing');
    const countRight = document.querySelector('.nav-count').getBoundingClientRect().right;
    assert(countRight < nav.getBoundingClientRect().left + nav.clientWidth - 5, 'Scrollbar overlaps tab counts');
    assert(nav.getBoundingClientRect().bottom > innerHeight - 12, 'Sidebar does not use bottom space');
    const search = document.querySelector('#search');
    const start = performance.now(); search.value = 'Research 123'; search.dispatchEvent(new Event('input'));
    const elapsed = performance.now() - start;
    assert(document.querySelector('#result-count').textContent === '15 of 5000 tabs', 'Large-list search incorrect');
    search.value = ''; search.dispatchEvent(new Event('input'));
    const list = document.querySelector('#tab-list'); list.scrollTop = 200000;
    await new Promise(resolve => setTimeout(resolve, 100));
    assert(document.querySelectorAll('.tab-row').length < 50, 'Scrolled list is not virtualized');
    const row = document.querySelector('.tab-row'); row.querySelector('input').click(); row.focus();
    window.performanceFocusKey = row.dataset.key;
    return { totalTabs: 5000, renderedRows: document.querySelectorAll('.tab-row').length, searchMilliseconds: Math.round(elapsed) };
  })()`);
  profile.tabs[10].title = 'Updated background title';
  window.webContents.send('profiles', [profile]);
  await new Promise(resolve => setTimeout(resolve, 50));
  await window.webContents.executeJavaScript(`if (document.activeElement?.dataset.key !== window.performanceFocusKey) throw new Error('Live update lost keyboard focus'); if (!document.querySelector('#selection-count').textContent.startsWith('1 selected')) throw new Error('Live update lost selection');`);
  console.log('Large workspace UI passed:', JSON.stringify(metrics), 'Live update retained selection and keyboard focus.');
  app.quit();
}).catch(error => { console.error(error); app.exit(1); });
