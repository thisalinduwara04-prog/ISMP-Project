const path = require('node:path');

// NFR-SEC-05 / UC-22 step 4: uploads are validated by extension AND magic
// bytes. The extension alone is a claim made by the client; the leading bytes
// are what the file actually is. Both must agree, so `payload.exe` renamed to
// `screenshot.png` is rejected even though its name looks harmless.
//
// A handful of signatures is enough for the four things a security incident
// realistically carries, and keeps this a 60-line file instead of a dependency.

const SIGNATURES = [
  {
    extensions: ['.png'],
    mimeType: 'image/png',
    magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  },
  {
    extensions: ['.jpg', '.jpeg'],
    mimeType: 'image/jpeg',
    magic: [0xff, 0xd8, 0xff],
  },
  {
    extensions: ['.pdf'],
    mimeType: 'application/pdf',
    magic: [0x25, 0x50, 0x44, 0x46], // "%PDF"
  },
];

// .eml and .txt have no signature of their own, so they are accepted only if
// the head of the file looks like text and does not begin with the header of
// something executable or archived. This is the loosest branch, which is why it
// carries the explicit deny-list rather than relying on "no match found".
const TEXT_EXTENSIONS = ['.eml', '.txt'];
const TEXT_MIME_BY_EXTENSION = { '.eml': 'message/rfc822', '.txt': 'text/plain' };

const EXECUTABLE_PREFIXES = [
  [0x4d, 0x5a], //             MZ      - Windows PE
  [0x50, 0x4b], //             PK      - zip, and therefore docx/xlsx/jar
  [0x7f, 0x45, 0x4c, 0x46], // \x7FELF - Linux ELF
  [0x23, 0x21], //             #!      - shell script
  [0xca, 0xfe, 0xba, 0xbe], // Mach-O / Java class
  [0x1f, 0x8b], //             gzip
  [0x52, 0x61, 0x72, 0x21], // Rar!
];

const startsWith = (buffer, bytes) =>
  buffer.length >= bytes.length && bytes.every((byte, i) => buffer[i] === byte);

const looksLikeText = (buffer) => {
  const head = buffer.subarray(0, 512);
  // A NUL byte in the first 512 bytes is the classic binary tell; no text
  // encoding this app accepts produces one.
  if (head.includes(0x00)) return false;
  return !EXECUTABLE_PREFIXES.some((prefix) => startsWith(buffer, prefix));
};

const ALLOWED_EXTENSIONS = Object.freeze([
  ...SIGNATURES.flatMap((s) => s.extensions),
  ...TEXT_EXTENSIONS,
]);

// Returns { mimeType, extension } for an accepted file, or null for a rejected
// one. The caller turns null into a 415 - this function never throws, so it can
// be used in a boolean context without a try/catch.
const sniff = (buffer, originalName) => {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return null;

  const extension = path.extname(originalName || '').toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(extension)) return null;

  const signature = SIGNATURES.find((s) => s.extensions.includes(extension));

  if (signature) {
    // The extension claims a format with a known header, so the header must
    // match that exact format. A .png whose bytes say JPEG is still a lie.
    return startsWith(buffer, signature.magic)
      ? { mimeType: signature.mimeType, extension }
      : null;
  }

  return looksLikeText(buffer)
    ? { mimeType: TEXT_MIME_BY_EXTENSION[extension], extension }
    : null;
};

module.exports = { sniff, ALLOWED_EXTENSIONS };
