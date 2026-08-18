const Incident = require('../models/Incident');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { DEFAULT_SEVERITY_BY_TYPE, INCIDENT_STATUS } = require('../config/constants');

// POST /api/incidents - any authenticated employee can report.
const createIncident = asyncHandler(async (req, res) => {
  const { type, description } = req.body;

  const incident = await Incident.create({
    reporter: req.user._id,
    type,
    description,
    severity: DEFAULT_SEVERITY_BY_TYPE[type],
    attachmentPath: req.file ? req.file.filename : null,
    attachmentOriginalName: req.file ? req.file.originalname : null,
    timeline: [
      {
        status: INCIDENT_STATUS.OPEN,
        note: 'Reported by employee.',
        changedBy: req.user._id,
      },
    ],
  });

  // In a production deployment this is where an email/SMS/webhook alert
  // would fire immediately for high-severity incidents. Logged here so the
  // behaviour is visible without external services configured.
  if (incident.severity === 'high') {
    // eslint-disable-next-line no-console
    console.warn(`[incident] HIGH severity incident reported: ${incident._id} (${incident.type})`);
  }

  res.status(201).json({ incident });
});

// GET /api/incidents/mine - reporter's own incidents + status.
const listMyIncidents = asyncHandler(async (req, res) => {
  const incidents = await Incident.find({ reporter: req.user._id }).sort({ createdAt: -1 });
  res.json({ incidents });
});

// GET /api/incidents (admin) - all incidents, filterable by status/severity.
const listAllIncidents = asyncHandler(async (req, res) => {
  const { status, severity, type } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (severity) filter.severity = severity;
  if (type) filter.type = type;

  const incidents = await Incident.find(filter)
    .populate('reporter', 'name employeeId department')
    .populate('assignedTo', 'name employeeId')
    .sort({ createdAt: -1 });
  res.json({ incidents });
});

// GET /api/incidents/:id
const getIncident = asyncHandler(async (req, res) => {
  const incident = await Incident.findById(req.params.id)
    .populate('reporter', 'name employeeId department')
    .populate('assignedTo', 'name employeeId');
  if (!incident) throw new AppError('Incident not found.', 404);

  const isOwner = incident.reporter._id.equals(req.user._id);
  const isAdmin = req.user.role === 'admin';
  if (!isOwner && !isAdmin) throw new AppError('Incident not found.', 404);

  res.json({ incident });
});

// PATCH /api/incidents/:id/status (admin) - open -> in_review -> resolved.
const updateIncidentStatus = asyncHandler(async (req, res) => {
  const { status, note, severity, assignedTo } = req.body;
  const incident = await Incident.findById(req.params.id);
  if (!incident) throw new AppError('Incident not found.', 404);

  incident.status = status;
  if (severity) incident.severity = severity;
  if (assignedTo) incident.assignedTo = assignedTo;
  incident.timeline.push({ status, note, changedBy: req.user._id });

  await incident.save();
  res.json({ incident });
});

module.exports = { createIncident, listMyIncidents, listAllIncidents, getIncident, updateIncidentStatus };
