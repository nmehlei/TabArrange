// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 nmehlei
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), net = require('node:net');
const { spawn } = require('node:child_process');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chr-ph-'));
process.env.CHR_ORGANIZER_DATA_DIR = root;
const { endpoint, tokenPath } = require('../src/shared.cjs');
const { encode, decoder } = require('../src/protocol.cjs');
const { id } = require('../src/extension-id.json');
const executable = process.argv[2] || (process.platform === 'darwin' ? path.resolve(`dist/mac${process.arch === 'arm64' ? '-arm64' : ''}/TabArrange.app/Contents/MacOS/TabArrange`) : path.resolve('dist/win-unpacked/TabArrange.exe'));
fs.writeFileSync(tokenPath, 'packaged-test-token', { mode: 0o600 });
let child, completed = false;
const timeout = setTimeout(() => { console.error('Packaged native host timed out'); child?.kill(); process.exit(1); }, 20000);
const server = net.createServer(socket => {
  socket.on('data', decoder(message => {
    if (message.type === 'authenticate') {
      if (message.token !== 'packaged-test-token') throw new Error('Authentication failed');
      socket.write(encode({ type: 'command', id: 'test', action: { type: 'refresh' } }));
    } else if (message.type === 'snapshot') {
      console.log('Packaged native host passed: standalone executable, authentication, bidirectional native messaging, no Node installation required.');
      completed = true; clearTimeout(timeout); child.kill(); socket.destroy(); server.close();
    }
  }));
});
server.listen(endpoint, () => {
  const windows = process.platform === 'win32';
  const args = windows ? [path.join(path.dirname(executable), 'resources', 'app.asar.unpacked', 'src', 'native-host.cjs')] : [`chrome-extension://${id}/`];
  child = spawn(executable, args, { stdio: ['pipe', 'pipe', 'pipe'], env: windows ? { ...process.env, ELECTRON_RUN_AS_NODE: '1' } : process.env });
  child.on('exit', (code, signal) => { if (completed) return; console.error(`Packaged native host exited early: ${code ?? signal}`); clearTimeout(timeout); server.close(); process.exit(1); });
  child.on('error', error => { console.error(error); process.exit(1); });
  child.stderr.on('data', chunk => process.stderr.write(chunk));
  child.stdout.on('data', decoder(message => {
    if (message.id !== 'test') throw new Error('Invalid frame');
    child.stdin.write(encode({ type: 'snapshot', test: true }));
  }));
});
