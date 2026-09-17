const MAX = 8 * 1024 * 1024;
function encode(value) {
  const body = Buffer.from(JSON.stringify(value));
  if (body.length > MAX) throw new Error('Message too large');
  const header = Buffer.alloc(4); header.writeUInt32LE(body.length);
  return Buffer.concat([header, body]);
}
function decoder(onMessage) {
  let pending = Buffer.alloc(0);
  return chunk => {
    pending = Buffer.concat([pending, chunk]);
    while (pending.length >= 4) {
      const size = pending.readUInt32LE(0);
      if (size > MAX) throw new Error('Message too large');
      if (pending.length < size + 4) return;
      const body = pending.subarray(4, size + 4);
      pending = pending.subarray(size + 4);
      onMessage(JSON.parse(body.toString('utf8')));
    }
  };
}
module.exports = { encode, decoder };
