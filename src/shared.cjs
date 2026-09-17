// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 nmehlei
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const directory = process.env.CHR_ORGANIZER_DATA_DIR || path.join(os.homedir(), '.chr-organizer');
const suffix = crypto.createHash('sha256').update(directory).digest('hex').slice(0, 16);
const endpoint = process.platform === 'win32' ? `\\\\.\\pipe\\chr-organizer-${suffix}` : path.join(directory, 'bridge.sock');
module.exports = { directory, endpoint, tokenPath: path.join(directory, 'token') };
