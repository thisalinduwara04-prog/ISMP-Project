const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const User = require('../models/User');
const Policy = require('../models/Policy');
const PolicyAcknowledgment = require('../models/PolicyAcknowledgment');
const TrainingModule = require('../models/TrainingModule');
const TrainingCompletion = require('../models/TrainingCompletion');
const Incident = require('../models/Incident');
const asyncHandler = require('../utils/asyncHandler');
const { POLICY_STATUS, ALL_ROLES } = require('../config/constants');

// Builds the core compliance dataset shared by both the dashboard JSON
// endpoint and the exportable reports, so the numbers always match.
async function buildComplianceSnapshot() {
  const users = await User.find({ isActive: true });
  const publishedPolicies = await Policy.find({ status: POLICY_STATUS.PUBLISHED });
  const activeModules = await TrainingModule.find({ isActive: true });
  const acks = await PolicyAcknowledgment.find();
  const completions = await TrainingCompletion.find();

  const ackSet = new Set(acks.map((a) => `${a.user}:${a.policy}:${a.versionNumber}`));
  const passedSet = new Set(
    completions.filter((c) => c.passed).map((c) => `${c.user}:${c.trainingModule}`)
  );

  const byDepartment = {};
  for (const role of ALL_ROLES) {
    if (role === 'admin') continue;
    byDepartment[role] = { department: role, employeeCount: 0, policyAckRate: 0, trainingCompletionRate: 0 };
  }

  const perDeptTotals = {};

  for (const user of users) {
    if (user.role === 'admin') continue;
    const dept = user.department;
    if (!perDeptTotals[dept]) {
      perDeptTotals[dept] = { employeeCount: 0, policySlots: 0, policyDone: 0, trainingSlots: 0, trainingDone: 0 };
    }
    perDeptTotals[dept].employeeCount += 1;

    const relevantPolicies = publishedPolicies.filter(
      (p) => !p.targetRoles.length || p.targetRoles.includes(dept)
    );
    relevantPolicies.forEach((p) => {
      const cv = p.currentVersion;
      if (!cv) return;
      perDeptTotals[dept].policySlots += 1;
      if (ackSet.has(`${user._id}:${p._id}:${cv.versionNumber}`)) perDeptTotals[dept].policyDone += 1;
    });

    const relevantModules = activeModules.filter(
      (m) => !m.targetRoles.length || m.targetRoles.includes(dept)
    );
    relevantModules.forEach((m) => {
      perDeptTotals[dept].trainingSlots += 1;
      if (passedSet.has(`${user._id}:${m._id}`)) perDeptTotals[dept].trainingDone += 1;
    });
  }

  Object.entries(perDeptTotals).forEach(([dept, t]) => {
    byDepartment[dept] = {
      department: dept,
      employeeCount: t.employeeCount,
      policyAckRate: t.policySlots ? Math.round((t.policyDone / t.policySlots) * 100) : 0,
      trainingCompletionRate: t.trainingSlots ? Math.round((t.trainingDone / t.trainingSlots) * 100) : 0,
    };
  });

  const openIncidents = await Incident.countDocuments({ status: { $ne: 'resolved' } });
  const totalIncidents = await Incident.countDocuments();
  const highSeverityOpen = await Incident.countDocuments({ severity: 'high', status: { $ne: 'resolved' } });

  return {
    generatedAt: new Date(),
    totals: {
      activeEmployees: users.filter((u) => u.role !== 'admin').length,
      publishedPolicies: publishedPolicies.length,
      activeTrainingModules: activeModules.length,
      openIncidents,
      highSeverityOpenIncidents: highSeverityOpen,
      totalIncidents,
    },
    byDepartment: Object.values(byDepartment),
  };
}

// GET /api/compliance/overview
const getOverview = asyncHandler(async (req, res) => {
  const snapshot = await buildComplianceSnapshot();
  res.json(snapshot);
});

// GET /api/compliance/export/excel
const exportExcel = asyncHandler(async (req, res) => {
  const snapshot = await buildComplianceSnapshot();

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ISPM Platform';
  workbook.created = new Date();

  const summary = workbook.addWorksheet('Summary');
  summary.columns = [
    { header: 'Metric', key: 'metric', width: 32 },
    { header: 'Value', key: 'value', width: 20 },
  ];
  Object.entries(snapshot.totals).forEach(([k, v]) => summary.addRow({ metric: k, value: v }));

  const dept = workbook.addWorksheet('By Department');
  dept.columns = [
    { header: 'Department', key: 'department', width: 20 },
    { header: 'Employees', key: 'employeeCount', width: 14 },
    { header: 'Policy Ack. Rate (%)', key: 'policyAckRate', width: 20 },
    { header: 'Training Completion Rate (%)', key: 'trainingCompletionRate', width: 28 },
  ];
  snapshot.byDepartment.forEach((row) => dept.addRow(row));
  [summary, dept].forEach((ws) => {
    ws.getRow(1).font = { bold: true };
  });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="compliance-report.xlsx"');
  await workbook.xlsx.write(res);
  res.end();
});

// GET /api/compliance/export/pdf
const exportPdf = asyncHandler(async (req, res) => {
  const snapshot = await buildComplianceSnapshot();

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="compliance-report.pdf"');

  const doc = new PDFDocument({ margin: 50 });
  doc.pipe(res);

  doc.fontSize(18).text('Savikro Enterprises - Compliance Report', { align: 'center' });
  doc.moveDown(0.3);
  doc.fontSize(10).fillColor('gray').text(`Generated: ${snapshot.generatedAt.toISOString()}`, { align: 'center' });
  doc.fillColor('black').moveDown(1.5);

  doc.fontSize(14).text('Summary');
  doc.moveDown(0.5);
  doc.fontSize(11);
  Object.entries(snapshot.totals).forEach(([k, v]) => {
    doc.text(`${k}: ${v}`);
  });

  doc.moveDown(1.5);
  doc.fontSize(14).text('By Department');
  doc.moveDown(0.5);
  doc.fontSize(11);
  snapshot.byDepartment.forEach((row) => {
    doc.text(
      `${row.department} — employees: ${row.employeeCount}, policy ack: ${row.policyAckRate}%, training: ${row.trainingCompletionRate}%`
    );
  });

  doc.end();
});

module.exports = { getOverview, exportExcel, exportPdf };
