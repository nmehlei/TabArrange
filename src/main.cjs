const { app, BrowserWindow, ipcMain, session, shell, clipboard } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { encode, decoder } = require('./protocol.cjs');
const { directory, endpoint, tokenPath } = require('./shared.cjs');
const { Store } = require('./store.cjs');
const { validSnapshot, validateAction } = require('./validation.cjs');
const installation = require('./installation.cjs');
// Preserve Electron preferences and localStorage across the TabArrange rename.
app.setPath('userData', process.env.CHR_ORGANIZER_DATA_DIR ? app.getPath('userData') : path.join(app.getPath('appData'), 'chr-organizer'));
app.setName('TabArrange');
let window, server, store;
const profiles = new Map(), pending = new Map(), profileLocks = new Set(), sockets = new Set();
const entry = pathToFileURL(path.join(__dirname, 'index.html')).href;
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (!window || window.isDestroyed()) createWindow(); window.show(); window.focus(); });
  app.whenReady().then(start).catch(error => { console.error(error); app.quit(); });
}
function snapshot() { return [...profiles.values()].map(({ socket, ...profile }) => profile); }
function publish() { if (window && !window.isDestroyed()) window.webContents.send('profiles', snapshot()); }
function validateSender(event) { if (event.sender !== window?.webContents || event.senderFrame?.url !== entry) throw new Error('Untrusted caller'); }
function request(profileId, action, onProgress) {
  const profile = profiles.get(profileId);
  if (!profile) return Promise.reject(new Error('Chrome profile disconnected'));
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const bytes = encode({ type: 'command', id, action });
    if (bytes.length > 1024 * 1024) return reject(new Error('Selection is too large for Chrome. Process fewer tabs at a time.'));
    const item = { resolve, reject, profile: profileId, socket: profile.socket, onProgress };
    item.reset = () => { clearTimeout(item.timer); item.timer = setTimeout(() => { pending.delete(id); reject(new Error('Chrome did not respond. Check Recovery before retrying a close.')); }, 120000); };
    item.reset(); pending.set(id, item);
    profile.socket.write(bytes, error => { if (error && pending.delete(id)) { clearTimeout(item.timer); reject(error); } });
  });
}
async function locked(profileId, callback) {
  if (profileLocks.has(profileId)) throw new Error('This profile is still processing an operation');
  profileLocks.add(profileId); try { return await callback(); } finally { profileLocks.delete(profileId); }
}
async function command(profileId, input) {
  const profile = profiles.get(profileId); if (!profile) throw new Error('Profile disconnected');
  validateAction(input, profile);
  if (['focus-window', 'close-window'].includes(input.type) && !profile.capabilities?.includes('window-actions')) throw new Error('Reload TabArrange Bridge at chrome://extensions to enable window actions.');
  if (input.type === 'favicons') return request(profileId, input);
  const action = { ...input, protections: store.settings() };
  return locked(profileId, async () => {
    let batch;
    if (['close', 'close-window'].includes(action.type)) batch = store.begin(profile, action.tabs.map(t => profile.tabs.find(item => item.id === t.id)));
    try {
      const result = await request(profileId, action, batch ? result => store.progress(batch, result) : undefined);
      if (batch) store.progress(batch, result);
      return { ...result, batchId: batch };
    } finally { if (batch) store.finish(batch); }
  });
}
async function recover(batchId, includeUncertain) {
  const batch = store.state.batches.find(b => b.id === batchId);
  if (!batch) throw new Error('Recovery record expired or was deleted');
  const profile = profiles.get(batch.profileId); if (!profile) throw new Error('Connect the original Chrome profile to reopen these tabs');
  return locked(profile.id, async () => {
    const tabs = batch.tabs.filter(t => t.status === 'closed' || (includeUncertain === true && t.status === 'uncertain'));
    if (!tabs.length) return { count: 0 };
    const originals = new Map(tabs.map(t => [t.id, t.status]));
    tabs.forEach(t => t.status = 'restoring'); store.save();
    const update = result => store.restoreProgress(batch.id, result, originals);
    try {
      const result = await request(profile.id, { type: 'restore', sessionId: profile.sessionId, originalSessionId: batch.sessionId, tabs: tabs.map(({ id, url, windowId, index }) => ({ id, url, windowId, index })) }, update);
      update(result); return result;
    } finally { tabs.forEach(t => { if (t.status === 'restoring') t.status = 'uncertain'; }); store.save(); }
  });
}
function handle(channel, callback) { ipcMain.handle(channel, (event, ...args) => { validateSender(event); return callback(...args); }); }
async function start() {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  store = new Store(directory);
  if (!fs.existsSync(tokenPath)) fs.writeFileSync(tokenPath, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
  const token = fs.readFileSync(tokenPath, 'utf8');
  if (process.platform !== 'win32' && fs.existsSync(endpoint)) fs.unlinkSync(endpoint);
  server = net.createServer(socket => {
    sockets.add(socket);
    let authenticated = false, profileId;
    const timer = setTimeout(() => socket.destroy(), 5000);
    const read = decoder(message => {
      if (!authenticated) {
        if (message.type !== 'authenticate' || message.token !== token) return socket.destroy();
        authenticated = true; clearTimeout(timer); return;
      }
      if (message.type === 'snapshot') {
        if (!validSnapshot(message) || (profileId && profileId !== message.profile.id)) return socket.destroy();
        profileId = message.profile.id;
        const previous = profiles.get(profileId);
        if (previous && previous.socket !== socket) previous.socket.destroy();
        profiles.set(profileId, { id: profileId, name: message.profile.name, sessionId: message.sessionId, capabilities: Array.isArray(message.capabilities) && message.capabilities.includes('window-actions') ? ['window-actions'] : [], tabs: message.tabs, windows: message.windows, groups: message.groups, socket });
        publish();
      } else if (['result', 'progress'].includes(message.type)) {
        const item = pending.get(message.id);
        if (!item || item.socket !== socket || item.profile !== profileId) return;
        if (message.type === 'progress') { item.onProgress?.(message.result); item.reset(); return; }
        clearTimeout(item.timer); pending.delete(message.id);
        message.error ? item.reject(new Error(message.error)) : item.resolve(message.result);
      }
    });
    socket.on('data', chunk => { try { read(chunk); } catch (error) { console.error('Bridge message rejected:', error.message); socket.destroy(); } });
    socket.on('error', () => {});
    socket.on('close', () => {
      clearTimeout(timer); sockets.delete(socket);
      if (profiles.get(profileId)?.socket === socket) { profiles.delete(profileId); publish(); }
      for (const [id, item] of pending) if (item.socket === socket) { clearTimeout(item.timer); pending.delete(id); item.reject(new Error('Chrome disconnected. Unfinished closures are recorded in Recovery.')); }
    });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(endpoint, resolve); });
  if (process.platform !== 'win32') fs.chmodSync(endpoint, 0o600);
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  handle('profiles', snapshot);
  handle('command', command);
  handle('settings', update => store.settings(update));
  handle('history', () => store.history());
  handle('recover', recover);
  handle('clear-history', () => { if (profileLocks.size) throw new Error('Wait for current operations to finish'); store.clear(); });
  handle('setup', async action => {
    if (action === 'register') installation.register({ app });
    else if (action === 'unregister') { if (profileLocks.size) throw new Error('Wait for current operations to finish'); installation.unregister(); for (const socket of sockets) socket.destroy(); }
    else if (action === 'folder') { const error = await shell.openPath(installation.extensionDirectory(app)); if (error) throw new Error(error); }
    else if (action === 'copy-path') clipboard.writeText(installation.extensionDirectory(app));
    else if (action && action !== 'status') throw new Error('Unknown setup action');
    return { ...installation.registrationStatus(app), profiles: snapshot().map(({ id, name }) => ({ id, name })) };
  });
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
}
function createWindow() {
  window = new BrowserWindow({ width: 1280, height: 850, minWidth: 900, minHeight: 600, backgroundColor: '#f6f7f9', title: 'TabArrange', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.loadURL(entry);
}
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { for (const socket of sockets) socket.destroy(); server?.close(); });
