const mongoose = require('mongoose');
const {
  INCIDENT_TYPES,
  INCIDENT_SEVERITY,
  INCIDENT_STATUS,
} = require('../config/constants');

const timelineEntrySchema = new mongoose.Schema(
  {
    status: { type: String, enum: Object.values(INCIDENT_STATUS), required: true },
    note: { type: String, default: '' },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    changedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const incidentSchema = new mongoose.Schema(
  {
    reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: Object.values(INCIDENT_TYPES), required: true },
    description: { type: String, required: true },
    attachmentPath: { type: String, default: null },
    attachmentOriginalName: { type: String, default: null },
    severity: { type: String, enum: Object.values(INCIDENT_SEVERITY), required: true },
    status: { type: String, enum: Object.values(INCIDENT_STATUS), default: INCIDENT_STATUS.OPEN },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    timeline: { type: [timelineEntrySchema], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Incident', incidentSchema);
