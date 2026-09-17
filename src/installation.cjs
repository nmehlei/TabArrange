const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { directory } = require('./shared.cjs');
const { id } = require('./extension-id.json');
const name = 'org.chrorganizer.bridge';
function bundledExtensionDirectory(app) { return app?.isPackaged ? path.join(process.resourcesPath, 'extension') : path.resolve(__dirname, '../extension'); }
function extensionDirectory(app) { const installed = path.join(directory, 'extension'); return fs.existsSync(installed) ? installed : bundledExtensionDirectory(app); }
function manifestPath() {
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library/Application Support/Google/Chrome/NativeMessagingHosts', name + '.json');
  if (process.platform === 'win32') return path.join(directory, name + '.json');
  return path.join(os.homedir(), '.config/google-chrome/NativeMessagingHosts', name + '.json');
}
function register({ app, destination = manifestPath(), executable = process.execPath, host = path.join(__dirname, 'native-host.cjs'), dataDirectory = directory, test = false } = {}) {
  fs.mkdirSync(dataDirectory, { recursive: true, mode: 0o700 });
  if (!test) fs.cpSync(bundledExtensionDirectory(app), path.join(dataDirectory, 'extension'), { recursive: true });
  let launcher = executable;
  if (!app?.isPackaged) {
    const useElectron = !!process.versions.electron;
    if (process.platform === 'win32') {
      launcher = path.join(dataDirectory, 'native-host.cmd');
      if (/["%\r\n]/.test(executable + host + dataDirectory)) throw new Error('Unsupported installation path characters');
      fs.writeFileSync(launcher, '@echo off\r\nsetlocal DisableDelayedExpansion\r\n' + (useElectron ? 'set ELECTRON_RUN_AS_NODE=1\r\n' : '') + (test ? `set "CHR_ORGANIZER_DATA_DIR=${dataDirectory}"\r\n` : '') + `"${executable}" "${host}"\r\n`);
    } else {
      launcher = path.join(dataDirectory, 'native-host');
      const q = s => "'" + s.replaceAll("'", "'\\''") + "'";
      fs.writeFileSync(launcher, '#!/bin/sh\n' + (test ? `export CHR_ORGANIZER_DATA_DIR=${q(dataDirectory)}\n` : '') + (useElectron ? 'export ELECTRON_RUN_AS_NODE=1\n' : '') + `exec ${q(executable)} ${q(host)}\n`, { mode: 0o700 });
      fs.chmodSync(launcher, 0o700);
    }
  }
  const manifest = { name, description: 'TabArrange local bridge', path: launcher, type: 'stdio', allowed_origins: [`chrome-extension://${id}/`] };
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  if (fs.existsSync(destination)) {
    const previous = JSON.parse(fs.readFileSync(destination, 'utf8'));
    if (previous.allowed_origins?.some(origin => !manifest.allowed_origins.includes(origin))) throw new Error('A different extension owns this bridge registration. Remove its registration before connecting this build.');
  }
  fs.writeFileSync(destination, JSON.stringify(manifest, null, 2));
  if (process.platform === 'win32' && !test) execFileSync('reg', ['add', `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${name}`, '/ve', '/t', 'REG_SZ', '/d', destination, '/f'], { windowsHide: true });
  return { registered: true, path: destination, extensionId: id };
}
function registrationStatus(app) {
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath(), 'utf8'));
    let registered = manifest.allowed_origins?.includes(`chrome-extension://${id}/`) && fs.existsSync(manifest.path);
    if (app?.isPackaged) registered = registered && manifest.path === process.execPath;
    if (registered && process.platform === 'win32') registered = execFileSync('reg', ['query', `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${name}`, '/ve'], { encoding: 'utf8', windowsHide: true }).includes(manifestPath());
    return { registered: !!registered, extensionId: id, extensionDirectory: extensionDirectory(app) };
  } catch { return { registered: false, extensionId: id, extensionDirectory: extensionDirectory(app) }; }
}
function unregister() {
  const file = manifestPath();
  if (fs.existsSync(file)) {
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (manifest.allowed_origins?.includes(`chrome-extension://${id}/`)) {
      if (process.platform === 'win32') execFileSync('reg', ['delete', `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${name}`, '/f'], { windowsHide: true });
      fs.unlinkSync(file);
    }
  }
  return { registered: false };
}
module.exports = { register, registrationStatus, unregister, extensionDirectory };
