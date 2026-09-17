// Chrome launches this process. stdout is reserved for native messaging frames.
const fs = require('node:fs');
const net = require('node:net');
const { encode, decoder } = require('./protocol.cjs');
const { endpoint, tokenPath } = require('./shared.cjs');
try {
  const token = fs.readFileSync(tokenPath, 'utf8');
  const socket = net.createConnection(endpoint);
  socket.on('connect', () => {
    socket.write(encode({ type: 'authenticate', token }));
    process.stdin.pipe(socket);
  });
  // Validate and reframe; never mix diagnostics into the native messaging stream.
  const read = decoder(message => process.stdout.write(encode(message)));
  socket.on('data', chunk => { try { read(chunk); } catch { process.exit(1); } });
  socket.on('error', () => process.exit(1));
  socket.on('close', () => process.exit(0));
  process.stdin.on('end', () => socket.end());
  process.stdout.on('error', () => process.exit(0));
} catch { process.exit(1); }
