const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
for (const directory of ['src', 'extension', 'scripts', 'tests']) for (const file of fs.readdirSync(directory)) if (/\.(cjs|mjs|js)$/.test(file)) execFileSync(process.execPath, ['--check', path.join(directory, file)], { stdio: 'inherit' });
JSON.parse(fs.readFileSync('extension/manifest.json'));
console.log('JavaScript syntax and extension manifest checked.');
