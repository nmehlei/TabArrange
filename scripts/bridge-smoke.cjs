// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 nmehlei
const { app } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { encode, decoder } = require('../src/protocol.cjs');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'chr-bridge-'));
process.env.CHR_ORGANIZER_DATA_DIR = directory;
app.setPath('userData', path.join(directory, 'electron'));
let host;
const timeout = setTimeout(() => { console.error('Bridge smoke timed out'); host?.kill(); app.exit(1); }, 15000);
app.on('browser-window-created', (_event, window) => {
  window.hide();
  window.webContents.once('did-finish-load', async () => {
    try {
      host = spawn(process.execPath, [path.resolve(__dirname, '../src/native-host.cjs')], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: ['pipe', 'pipe', 'inherit'] });
      host.on('error', error => { console.error(error); app.exit(1); });
      const read = decoder(message => {
        if (message.type !== 'command' || message.action.type !== 'focus') throw new Error('Unexpected command');
        host.stdin.write(encode({ type: 'result', id: message.id, result: { count: 1 } }));
      });
      host.stdout.on('data', read);
      host.stdin.write(encode({ type: 'snapshot', sessionId: 'test-session', profile: { id: 'smoke', name: 'Test profile' }, tabs: [{ id: 1, url: 'https://example.test/', title: 'Test tab', windowId: 1, groupId: -1 }], windows: [{ id: 1 }], groups: [] }));
      await window.webContents.executeJavaScript(`(async () => {
        const deadline = Date.now() + 5000;
        while (!(await window.chromeBridge.profiles()).length) {
          if (Date.now() > deadline) throw new Error('Snapshot never arrived');
          await new Promise(resolve => setTimeout(resolve, 20));
        }
        const profiles = await window.chromeBridge.profiles();
        if (profiles[0].tabs[0].title !== 'Test tab') throw new Error('Snapshot corrupted');
        const result = await window.chromeBridge.command('smoke', { type: 'focus', sessionId: 'test-session', tabs: [{ id: 1, url: 'https://example.test/' }] });
        if (result.count !== 1) throw new Error('Response was not routed');
      })()`);
      console.log('Bridge smoke passed: native host ↔ local socket ↔ desktop IPC ↔ renderer, including command and response. No Chrome connection.');
      clearTimeout(timeout); host.kill(); app.quit();
    } catch (error) { clearTimeout(timeout); console.error(error); host?.kill(); app.exit(1); }
  });
});
require('../src/main.cjs');
