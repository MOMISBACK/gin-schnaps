'use strict';
// TeselaGen only uses the callable generator in the source paths included here.
// Never used as an authentication token or a persistent scientific identity.
function generate() {
  const bytes = new Uint8Array(16);
  if (!globalThis.crypto || !globalThis.crypto.getRandomValues) throw new Error('Random source unavailable for display IDs');
  globalThis.crypto.getRandomValues(bytes);
  return 'sg_' + Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}
module.exports = generate;
module.exports.generate = generate;
