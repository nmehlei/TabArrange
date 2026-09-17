// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 nmehlei
const { app, BrowserWindow } = require('electron');
const path = require('node:path'), fs = require('node:fs');
app.setPath('userData', path.join(require('node:os').tmpdir(), 'chr-icons'));
app.whenReady().then(async () => {
  const window = new BrowserWindow({ width: 1024, height: 1024, show: false, transparent: true, frame: false, webPreferences: { sandbox: true } });
  await window.loadURL('data:text/html,' + encodeURIComponent('<html><body style="margin:0;background:transparent">' + fs.readFileSync(path.resolve('build/icon.svg'), 'utf8') + '</body></html>'));
  await new Promise(resolve => setTimeout(resolve, 100));
  const image = await window.webContents.capturePage();
  fs.writeFileSync(path.resolve('build/icon.png'), image.resize({ width: 1024, height: 1024 }).toPNG());
  console.log('Generated application icon from build/icon.svg'); app.quit();
}).catch(error => { console.error(error); app.exit(1); });
