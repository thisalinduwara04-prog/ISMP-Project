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
// Storage is MEMORY, not disk: the bytes go into MongoDB (see
// models/PolicyAttachment.js), so nothing is ever written to the filesystem.
// That removes a whole class of problem at a stroke - no path traversal, no
// file left executable, no orphaned file when a database write fails, and
// nothing to lose when the server is redeployed. The size cap is what makes
// buffering in memory safe.

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB (NFR-SEC-05)

// "%PDF-" - every valid PDF starts with this, whatever it is named.
const PDF_SIGNATURE = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]);

const hasPdfSignature = (buffer) =>
  Buffer.isBuffer(buffer) &&
  buffer.length >= PDF_SIGNATURE.length &&
  buffer.subarray(0, PDF_SIGNATURE.length).equals(PDF_SIGNATURE);

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
      `Send exactly one file, in a field named "${error.field ? 'file' : 'file'}".`,
      AppErrorCode.VALIDATION_ERROR
    );
  }
  return new AppError(BAD_REQUEST, `Upload failed: ${error.message}`, AppErrorCode.VALIDATION_ERROR);
};

// Accepts ONE pdf in the `file` field and leaves it on req.file.buffer.
const singlePdf = () => {
  const handler = multer({
    storage: multer.memoryStorage(),
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
    handler(req, res, (error) => {
      if (error) return next(translateMulterError(error));

      if (!req.file || !req.file.buffer) {
        return next(
          new AppError(BAD_REQUEST, 'No file was attached.', AppErrorCode.VALIDATION_ERROR)
        );
      }

      // The check the other three cannot make. Nothing has been persisted at
      // this point, so rejecting simply drops the buffer.
      if (!hasPdfSignature(req.file.buffer)) {
        return next(
          new AppError(
            UNSUPPORTED_MEDIA_TYPE,
            'That file is not a PDF. It was rejected after inspecting its contents, whatever its name and type claimed.',
            AppErrorCode.VALIDATION_ERROR
          )
        );
      }

      return next();
    });
};

module.exports = { singlePdf, MAX_BYTES, hasPdfSignature };
