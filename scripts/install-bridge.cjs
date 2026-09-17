// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 nmehlei
const { register, unregister } = require('../src/installation.cjs');
const result = process.argv.includes('--remove') ? unregister() : register();
console.log(result.registered ? 'Bridge registered. Load the extension folder in Chrome, start TabArrange, and click the extension icon.' : 'Bridge registration removed. Recovery records are preserved.');
