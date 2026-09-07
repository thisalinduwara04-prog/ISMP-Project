const mongoose = require('mongoose');

// The signed PDF that accompanies a policy version (US-016), stored IN THE
// DATABASE rather than on the server's filesystem.
//
// Why its own collection rather than a field on policyVersions: the versions
// collection is read on every list and every audience query, and a 10 MB
// binary embedded in those documents would be loaded on every one of them.
// Keeping the bytes in a separate document means a version stays small and the
// file is fetched only when somebody actually opens it.
//
// Trade-off worth stating: MongoDB caps a single document at 16 MB, so this
// approach only holds because uploads are capped at 10 MB. Anything larger
// would need GridFS, which chunks a file across documents.
const policyAttachmentSchema = new mongoose.Schema(
  {
    // Several attachments may hang off one version - a policy is sometimes two
    // documents, and forcing them into one file would mean editing a signed
    // PDF. Bounded by MAX_ATTACHMENTS in the service, because an unbounded
    // list of 10 MB documents is a denial-of-service waiting to happen.
    policyVersionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PolicyVersion',
      required: true,
    },

    policyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Policy', required: true },

    // The name the admin's file had, kept for display and for the download
    // filename. Never used to build a path - there is no path any more.
    originalName: { type: String, required: true },

    // Fixed at 'application/pdf': the magic-byte check on the way in is what
    // guarantees the bytes match, so this is not client-supplied trust.
    mimeType: { type: String, required: true, default: 'application/pdf' },

    sizeBytes: { type: Number, required: true },

    // The file itself. `select: false` so a stray query cannot drag megabytes
    // into memory - it has to be asked for explicitly, which only the download
    // route does.
    data: { type: Buffer, required: true, select: false },

    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

// Serves "the files for this version", oldest first, which is the order they
// are listed and downloaded in.
policyAttachmentSchema.index({ policyVersionId: 1, createdAt: 1 });

module.exports = mongoose.model('PolicyAttachment', policyAttachmentSchema);
