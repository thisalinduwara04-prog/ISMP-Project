const crypto = require('crypto');

// Stable identifiers for embedded content items, questions and options (7.8).
//
// These are NOT ObjectIds on purpose: they are generated once, travel inside a
// progress record (`progress.completedItemIds`) and inside an attempt response
// (`responses[].questionId`), and must survive an admin reordering or editing
// the module afterwards. An array index would not - reordering content would
// silently rewrite what a learner had completed and which question they
// answered.
//
// The nanoid alphabet and shape, generated from Node's own CSPRNG rather than
// pulling in the package: nanoid v5 is ESM-only, and this is four lines.
const ALPHABET = 'useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict';

// 64 characters, so a 6-bit mask maps each random byte onto exactly one
// character with no modulo bias and no rejection loop.
const nanoid = (size = 12) => {
  const bytes = crypto.randomBytes(size);
  let id = '';
  for (let i = 0; i < size; i += 1) id += ALPHABET[bytes[i] & 63];
  return id;
};

module.exports = { nanoid };
