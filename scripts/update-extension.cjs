const fs = require('node:fs'), path = require('node:path');
const { directory } = require('../src/shared.cjs');
const destination = path.join(directory, 'extension');
if (!fs.existsSync(path.join(destination, 'manifest.json'))) throw new Error('Enable the bridge in TabArrange first.');
fs.cpSync(path.resolve(__dirname, '../extension'), destination, { recursive: true });
console.log('Installed extension files updated. Click Reload on TabArrange Bridge at chrome://extensions to activate the update. Existing Chrome tabs are unaffected.');
