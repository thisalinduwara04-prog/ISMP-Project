const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const multer = require('multer');

const AppError = require('../utils/AppError');
const AppErrorCode = require('../constants/appErrorCode');
const { PAYLOAD_TOO_LARGE, UNSUPPORTED_MEDIA_TYPE, BAD_REQUEST } = require('../constants/http');

// ---------------------------------------------------------------------------
// File upload, treated as a malware vector - because that is what it is.
// ---------------------------------------------------------------------------
//
// Four independent things have to be true before a file is accepted, and each
// one is there because the others can be defeated on their own:
//
//   1. The extension is on an allow-list. Stops the obvious.
//   2. The declared MIME type matches. Stops the slightly less obvious.
//   3. The MAGIC BYTES match. This is the one that counts - 1 and 2 are both
//      supplied by the client, so a .exe renamed to .pdf with a forged
//      Content-Type passes them and fails here.
//   4. It is under the size cap, enforced by Multer so the connection is cut
//      early rather than after the whole file has arrived.
//
// Stored files are named with a generated UUID and written OUTSIDE any served
// directory. The client's filename is never used on disk: it is kept only as a
// display string, so "../../../.env" and "index.html" are both harmless.

const UPLOAD_ROOT = path.join(__dirname, '..', '..', 'uploads');

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB (NFR-SEC-05)

// "%PDF-" - every valid PDF starts with this, whatever it is named.
const PDF_SIGNATURE = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]);

const directoryFor = (kind) => {
  const directory = path.join(UPLOAD_ROOT, kind);
  fs.mkdirSync(directory, { recursive: true });
  return directory;
};

// Read just the header. Loading a 10 MB file into memory to look at five bytes
// would be wasteful, and on a hostile file, unwise.
const hasPdfSignature = async (filePath) => {
  const handle = await fsp.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(PDF_SIGNATURE.length);
    const { bytesRead } = await handle.read(buffer, 0, PDF_SIGNATURE.length, 0);
    return bytesRead === PDF_SIGNATURE.length && buffer.equals(PDF_SIGNATURE);
  } finally {
    await handle.close();
  }
};

// Best-effort: a file we have already decided to reject must not be left
// behind, but failing to delete it must not turn a clean 415 into a 500.
const discard = async (filePath) => {
  if (!filePath) return;
  try {
    await fsp.unlink(filePath);
  } catch {
    /* already gone */
  }
};

const translateMulterError = (error) => {
  if (!(error instanceof multer.MulterError)) return error;

  if (error.code === 'LIMIT_FILE_SIZE') {
    return new AppError(
      PAYLOAD_TOO_LARGE,
      'That file is larger than the 10 MB limit.',
      AppErrorCode.VALIDATION_ERROR
    );
  }
  if (error.code === 'LIMIT_UNEXPECTED_FILE') {
    return new AppError(
      BAD_REQUEST,
      'Send exactly one file, in a field named "file".',
      AppErrorCode.VALIDATION_ERROR
    );
  }
  return new AppError(BAD_REQUEST, `Upload failed: ${error.message}`, AppErrorCode.VALIDATION_ERROR);
};

// Returns middleware accepting ONE pdf in the `file` field, stored under
// uploads/<kind>/ with a generated name.
const singlePdf = (kind) => {
  const destination = directoryFor(kind);

  const handler = multer({
    storage: multer.diskStorage({
      destination: (req, file, callback) => callback(null, destination),
      // The client's name is never used for storage. Extension is fixed
      // because the allow-list below permits nothing else.
      filename: (req, file, callback) => callback(null, `${crypto.randomUUID()}.pdf`),
    }),
    limits: { fileSize: MAX_BYTES, files: 1 },
    fileFilter: (req, file, callback) => {
      const extension = path.extname(file.originalname || '').toLowerCase();

      if (extension !== '.pdf' || file.mimetype !== 'application/pdf') {
        return callback(
          new AppError(
            UNSUPPORTED_MEDIA_TYPE,
            'Only PDF files can be attached to a policy version.',
            AppErrorCode.VALIDATION_ERROR
          )
        );
      }
      return callback(null, true);
    },
  }).single('file');

  return (req, res, next) =>
    handler(req, res, async (error) => {
      if (error) return next(translateMulterError(error));

      if (!req.file) {
        return next(
          new AppError(BAD_REQUEST, 'No file was attached.', AppErrorCode.VALIDATION_ERROR)
        );
      }

      // The check the other three cannot make. Anything failing here was
      // actively disguised, so the file is deleted rather than quarantined.
      try {
        if (!(await hasPdfSignature(req.file.path))) {
          await discard(req.file.path);
          return next(
            new AppError(
              UNSUPPORTED_MEDIA_TYPE,
              'That file is not a PDF. It was rejected after inspecting its contents, whatever its name and type claimed.',
              AppErrorCode.VALIDATION_ERROR
            )
          );
        }
      } catch (inspectionError) {
        await discard(req.file.path);
        return next(inspectionError);
      }

      return next();
    });
};

module.exports = { singlePdf, discard, directoryFor, UPLOAD_ROOT, MAX_BYTES, hasPdfSignature };
