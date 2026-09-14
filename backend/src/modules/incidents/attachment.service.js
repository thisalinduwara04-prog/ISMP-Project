const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const multer = require('multer');

const env = require('../../config/env');
const AppError = require('../../utils/AppError');
const AppErrorCode = require('../../constants/appErrorCode');
const { UNSUPPORTED_MEDIA_TYPE } = require('../../constants/http');
const { sniff, ALLOWED_EXTENSIONS } = require('../../utils/fileType');

// Resolved once, from the backend root rather than the CWD, so `npm start` from
// anywhere writes to the same place.
const UPLOAD_ROOT = path.resolve(__dirname, '../../..', env.UPLOAD_DIR);

const MAX_BYTES = env.MAX_UPLOAD_MB * 1024 * 1024;

// memoryStorage, not diskStorage: the buffer is inspected BEFORE anything
// touches the filesystem, so a rejected file never leaves an orphan on disk to
// be cleaned up later. At a 10 MB cap and one file per request the memory cost
// is not worth engineering around.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
});

const unsupportedType = () =>
  new AppError(
    UNSUPPORTED_MEDIA_TYPE,
    `That file type is not accepted. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}. You can still submit the report without an attachment.`,
    AppErrorCode.UNSUPPORTED_FILE_TYPE,
    [{ field: 'attachment', issue: 'unsupported_type' }]
  );

// Validates and persists one uploaded file, returning the subdocument to embed
// on the incident. Throws a 415 AppError if the file is not what it claims.
const store = async (file) => {
  const sniffed = sniff(file.buffer, file.originalname);
  if (!sniffed) throw unsupportedType();

  // The name on disk is generated, never derived from user input, so a filename
  // like "../../app.js" has nowhere to go (NFR-SEC-05).
  const storageKey = `${crypto.randomUUID()}${sniffed.extension}`;

  await fs.mkdir(UPLOAD_ROOT, { recursive: true });
  await fs.writeFile(path.join(UPLOAD_ROOT, storageKey), file.buffer);

  return {
    fileName: file.originalname,
    storageKey,
    // The sniffed type, not the client-supplied `file.mimetype`. The client's
    // claim was only ever an input to validation.
    mimeType: sniffed.mimeType,
    sizeBytes: file.size,
    uploadedAt: new Date(),
  };
};

// `storageKey` always comes from a stored attachment subdocument, never from
// the request, so this cannot be pointed outside UPLOAD_ROOT. `path.basename`
// is belt and braces.
const absolutePathFor = (storageKey) => path.join(UPLOAD_ROOT, path.basename(storageKey));

module.exports = { upload, store, absolutePathFor, UPLOAD_ROOT, MAX_BYTES };
