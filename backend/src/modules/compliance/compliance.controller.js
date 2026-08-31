const compliance = require('./compliance.service');
const reminders = require('./reminder.service');
const reports = require('./report.service');
const audit = require('../audit/audit.service');
const Notification = require('../../models/Notification');
const mail = require('./mail.service');
const { OK, ACCEPTED } = require('../../constants/http');
const { AUDIT_ACTIONS, AUDIT_ENTITY_TYPE } = require('../../constants/auditActions');

const success = (req, res, data, status = OK) => res.status(status).json({ success: true, data, requestId: req.id });

const me = async (req, res) => success(req, res, await compliance.getPersonalCompliance(req.user._id));

const dashboard = async (req, res) => {
  const data = await compliance.getDashboard(req.scope, req.query);
  await audit.recordForUser(req.user, {
    action: AUDIT_ACTIONS.COMPLIANCE_DASHBOARD_VIEWED,
    entityType: AUDIT_ENTITY_TYPE.COMPLIANCE_REPORT,
    metadata: { scope: req.scope, filters: req.query },
    req,
  });
  return success(req, res, data);
};

const outstanding = async (req, res) => {
  const { page, pageSize, ...filters } = req.query;
  return success(req, res, await compliance.getOutstanding(req.scope, filters, page, pageSize));
};

const userCompliance = async (req, res) =>
  success(req, res, await compliance.getUserCompliance(req.scope, req.params.id));

const sendReminders = async (req, res) => {
  const { userIds, assignmentIds } = req.body;
  const data = await reminders.sendReminders({
    scope: req.scope,
    userIds,
    assignmentIds,
    actor: req.user,
    req,
  });
  return success(req, res, data);
};

const exportReport = async (req, res) => {
  const { format, department, ...filters } = req.body;
  const rows = await compliance.getReportRows(req.scope, filters);
  const generatedAt = new Date();
  const reportContext = { rows, generatedBy: req.user, scope: req.scope, filters, generatedAt };
  const extension = format.toLowerCase();
  const scopeName = (req.scope.department || 'organisation').toLowerCase();
  const filename = `compliance-${scopeName}-${generatedAt.toISOString().slice(0, 10)}.${extension}`;
  const contentType = format === 'XLSX'
    ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    : 'application/pdf';

  await audit.recordForUser(req.user, {
    action: AUDIT_ACTIONS.COMPLIANCE_REPORT_EXPORTED,
    entityType: AUDIT_ENTITY_TYPE.COMPLIANCE_REPORT,
    metadata: { format, scope: req.scope, rowCount: rows.length, filters },
    req,
  });

  if (rows.length > 5000) {
    const recipient = { id: req.user._id, email: req.user.email, fullName: req.user.fullName };
    setImmediate(async () => {
      try {
        const content = format === 'XLSX'
          ? await reports.generateXlsx(reportContext)
          : await reports.generatePdf(reportContext);
        await mail.sendReport({
          to: recipient.email,
          subject: 'Your Savikro compliance report is ready',
          text: `Hello ${recipient.fullName},\n\nYour requested compliance report is attached.`,
          filename,
          content,
          contentType,
        });
        await Notification.create({
          userId: recipient.id,
          type: Notification.NOTIFICATION_TYPE.REPORT_READY,
          title: 'Compliance report delivered',
          message: `${filename} was generated and emailed to you.`,
          linkPath: '/notifications',
        });
      } catch (error) {
        await Notification.create({
          userId: recipient.id,
          type: Notification.NOTIFICATION_TYPE.REPORT_FAILED,
          title: 'Compliance report delivery failed',
          message: 'The report could not be delivered. Check the development SMTP configuration and try again.',
          linkPath: '/compliance',
          priority: 'HIGH',
          emailError: error.message.slice(0, 500),
        }).catch(() => {});
      }
    });
    return success(req, res, { queued: true, rowCount: rows.length, delivery: recipient.email }, ACCEPTED);
  }

  const buffer = format === 'XLSX'
    ? await reports.generateXlsx(reportContext)
    : await reports.generatePdf(reportContext);

  res.set({
    'Content-Type': contentType,
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Content-Length': buffer.length,
  });
  return res.status(OK).send(buffer);
};

module.exports = { me, dashboard, outstanding, userCompliance, sendReminders, exportReport };
