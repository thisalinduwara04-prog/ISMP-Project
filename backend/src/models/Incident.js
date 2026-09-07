const mongoose = require('mongoose');

const { ALL_DEPARTMENTS } = require('../constants/roles');
const {
  ALL_INCIDENT_TYPES,
  ALL_INCIDENT_SEVERITIES,
  ALL_INCIDENT_STATUSES,
  ALL_SEVERITY_SET_BY,
  INCIDENT_STATUS,
  SEVERITY_SET_BY,
} = require('../constants/incidents');

// Spec section 7.11. Two things are embedded rather than referenced:
// `attachments` (at most a handful, always read with the incident) and
// `statusHistory` (bounded by the length of the workflow). Neither can grow
// unboundedly, which is the test section 7.1 sets for embedding.

const attachmentSchema = new mongoose.Schema(
  {
    fileName: { type: String, required: true },      // original name, display only
    storageKey: { type: String, required: true },    // generated UUID name on disk
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true } // the _id is the `fid` in GET /incidents/:id/attachments/:fid
);

// Append-only in practice: the service only ever $push-es. Nothing updates or
// removes an entry, because the point of the trail is that it cannot be tidied.
const statusHistorySchema = new mongoose.Schema(
  {
    fromStatus: { type: String, enum: [...ALL_INCIDENT_STATUSES, null], default: null },
    toStatus: { type: String, enum: ALL_INCIDENT_STATUSES, required: true },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    changedAt: { type: Date, default: Date.now },
    note: { type: String, default: null },
  },
  { _id: false }
);

const incidentSchema = new mongoose.Schema(
  {
    // Human-quotable, so an employee can ring IT and say a reference rather
    // than read out an ObjectId.
    reference: { type: String, required: true, unique: true, uppercase: true, trim: true },

    reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Denormalised from the reporter at submission time so the triage queue can
    // group by department without a $lookup, and so the record still reads
    // correctly if the person later transfers.
    reporterDepartment: { type: String, required: true, enum: ALL_DEPARTMENTS },

    type: { type: String, required: true, enum: ALL_INCIDENT_TYPES },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    occurredAt: { type: Date, default: null },

    // Derived from `type` at submission (US-037), never supplied by the
    // reporter. An admin may override it; `severitySetBy` is what stops the
    // original system judgement being silently lost.
    severity: { type: String, required: true, enum: ALL_INCIDENT_SEVERITIES },
    severitySetBy: {
      type: String,
      required: true,
      enum: ALL_SEVERITY_SET_BY,
      default: SEVERITY_SET_BY.SYSTEM_DEFAULT,
    },

    status: {
      type: String,
      required: true,
      enum: ALL_INCIDENT_STATUSES,
      default: INCIDENT_STATUS.OPEN,
    },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    attachments: { type: [attachmentSchema], default: [] },
    statusHistory: { type: [statusHistorySchema], default: [] },

    resolutionNote: { type: String, default: null },
    resolvedAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },

    // M6 hooks. Defined now so the shape matches spec section 7.11; nothing in
    // M5 writes them.
    simulationRelated: { type: Boolean, default: false },
    campaignId: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { timestamps: true }
);

// Spec section 7.16. The unique index on `reference` comes from `unique: true`
// on the field above - declaring it again here would build it twice.
incidentSchema.index({ status: 1, severity: -1, createdAt: -1 }); // admin triage queue
incidentSchema.index({ reportedBy: 1, createdAt: -1 }); // My Reports

// Attachments are serialised WITHOUT `storageKey`. The client gets an opaque
// subdocument id and asks the API for the file; it never learns, and therefore
// can never influence, a path on disk (NFR-SEC-05, NFR-SEC-07).
const publicAttachment = (a) => ({
  id: a._id.toString(),
  fileName: a.fileName,
  mimeType: a.mimeType,
  sizeBytes: a.sizeBytes,
  uploadedAt: a.uploadedAt,
});

// A populated ref may be an ObjectId or a User document depending on the query.
const publicUser = (value) => {
  if (!value) return null;
  if (value._id && value.fullName) {
    return {
      id: value._id.toString(),
      fullName: value.fullName,
      employeeId: value.employeeId,
      department: value.department,
    };
  }
  return { id: value.toString() };
};

// UC-25. What the person who filed the report may see: their own submission and
// the outcome, with no view of who is handling it internally or of the triage
// conversation.
incidentSchema.methods.toReporterJSON = function toReporterJSON() {
  return {
    id: this._id.toString(),
    reference: this.reference,
    type: this.type,
    title: this.title,
    description: this.description,
    occurredAt: this.occurredAt,
    severity: this.severity,
    status: this.status,
    attachments: this.attachments.map(publicAttachment),
    resolutionNote: this.resolutionNote,
    resolvedAt: this.resolvedAt,
    closedAt: this.closedAt,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

// The admin view. Everything above, plus who reported it, who owns it and the
// full handling record (UC-23).
incidentSchema.methods.toTriageJSON = function toTriageJSON() {
  return {
    ...this.toReporterJSON(),
    reportedBy: publicUser(this.reportedBy),
    reporterDepartment: this.reporterDepartment,
    severitySetBy: this.severitySetBy,
    assignedTo: publicUser(this.assignedTo),
    statusHistory: this.statusHistory.map((entry) => ({
      fromStatus: entry.fromStatus,
      toStatus: entry.toStatus,
      changedBy: publicUser(entry.changedBy),
      changedAt: entry.changedAt,
      note: entry.note,
    })),
  };
};

module.exports = mongoose.model('Incident', incidentSchema);
