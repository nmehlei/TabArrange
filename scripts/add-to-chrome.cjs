// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 nmehlei
// Prepare Chrome's supported unpacked-extension installation flow.
// Does not edit Chrome profiles or replace an existing native-host registration.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawn } = require('node:child_process');
const { directory } = require('../src/shared.cjs');
const folder = path.join(directory, 'extension');
const manifestFile = path.join(folder, 'manifest.json');
if (!fs.existsSync(manifestFile)) {
  console.error('First open TabArrange → Connect Chrome → Enable bridge, then run this helper again.');
  process.exit(1);
}
const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
if (!['TabArrange Bridge', 'ChrOrganizer Bridge'].includes(manifest.name)) throw new Error('The installed folder is not the TabArrange extension');
const { id } = require('../src/extension-id.json');
if (process.argv.includes('--check')) {
  console.log(`Ready: ${manifest.name} ${manifest.version}\nFolder: ${folder}\nExpected Chrome ID: ${id}`);
  process.exit(0);
}
if (process.platform === 'darwin') {
  execFileSync('/usr/bin/pbcopy', [], { input: folder });
  execFileSync('/usr/bin/osascript', ['-e', `
    tell application "Google Chrome"
      activate
      if (count of windows) is 0 then make new window
      set foundTab to false
      repeat with browserWindow in windows
        set tabNumber to 0
        repeat with browserTab in tabs of browserWindow
          set tabNumber to tabNumber + 1
          if URL of browserTab starts with "chrome://extensions" then
            set active tab index of browserWindow to tabNumber
            set index of browserWindow to 1
            set foundTab to true
            exit repeat
          end if
        end repeat
        if foundTab then exit repeat
      end repeat
      if not foundTab then
        tell front window
          make new tab at end of tabs with properties {URL:"chrome://extensions/"}
          set active tab index to count of tabs
        end tell
      end if
    end tell
  `]);
  console.log('Chrome Extensions is open and the folder path is on your clipboard.\n1. Enable Developer mode (top right).\n2. Click Load unpacked.\n3. Press Cmd+Shift+G, then Cmd+V and Return. Click Select.');
} else if (process.platform === 'win32') {
  const candidates = [process.env.LOCALAPPDATA, process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)']].filter(Boolean).map(base => path.join(base, 'Google/Chrome/Application/chrome.exe'));
  const executable = candidates.find(candidate => fs.existsSync(candidate));
  if (!executable) throw new Error('Google Chrome was not found in a standard install location. Open chrome://extensions manually. Extension folder: ' + folder);
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Set-Clipboard -Value $env:CHR_EXTENSION_FOLDER'], { env: { ...process.env, CHR_EXTENSION_FOLDER: folder }, windowsHide: true });
  const child = spawn(executable, ['chrome://extensions/'], { detached: true, stdio: 'ignore' });
  child.on('error', error => { console.error(error.message); process.exitCode = 1; });
  child.unref();
  console.log('Chrome Extensions is opening and the folder path is on your clipboard.\n1. Enable Developer mode (top right).\n2. Click Load unpacked.\n3. Paste the path into the folder picker and select that folder.');
} else {
  console.error(`Open chrome://extensions, enable Developer mode, and load this folder: ${folder}`);
  process.exitCode = 1;
}
console.log('Keep TabArrange open. Its tabs should appear within 30 seconds after installation.');
