// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 nmehlei
// A packaged executable doubles as Chrome's native host. Chrome passes its caller origin.
const { id } = require('./extension-id.json');
const origin = process.argv.find(arg => arg.startsWith('chrome-extension://'));
if (origin) {
  if (origin !== `chrome-extension://${id}/`) process.exit(1);
  const { app } = require('electron');
  app.disableHardwareAcceleration();
  app.whenReady().then(() => app.dock?.hide());
  require('./native-host.cjs');
} else require('./main.cjs');
