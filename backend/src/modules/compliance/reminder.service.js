const Assignment = require('../../models/Assignment');
const Notification = require('../../models/Notification');
const User = require('../../models/User');
const audit = require('../audit/audit.service');
const mail = require('./mail.service');
const { buildMatch, clearDashboardCache } = require('./compliance.service');
const { AUDIT_ACTIONS, AUDIT_OUTCOME, AUDIT_ENTITY_TYPE } = require('../../constants/auditActions');

const DAY_MS = 24 * 60 * 60 * 1000;
const THREE_DAYS_MS = 3 * DAY_MS;

const markOverdue = async (now = new Date()) => {
  const result = await Assignment.updateMany(
    {
      status: { $in: [Assignment.ASSIGNMENT_STATUS.PENDING, Assignment.ASSIGNMENT_STATUS.IN_PROGRESS] },
      dueDate: { $lt: now },
    },
    { $set: { status: Assignment.ASSIGNMENT_STATUS.OVERDUE } }
  );
  if (result.modifiedCount) clearDashboardCache();
  return result.modifiedCount;
};

const sendOne = async (assignment, user, now) => {
  const overdue = assignment.dueDate < now;
  const type = overdue ? Notification.NOTIFICATION_TYPE.REMINDER_OVERDUE : Notification.NOTIFICATION_TYPE.REMINDER_DUE;
  const dueText = assignment.dueDate.toISOString().slice(0, 10);
  const notification = await Notification.create({
    userId: user._id,
    type,
    title: overdue ? 'Compliance item overdue' : 'Compliance item due soon',
    message: `${assignment.itemTitle} is ${overdue ? 'overdue' : `due on ${dueText}`}. Please complete it as soon as possible.`,
    linkPath: '/my-tasks',
    priority: overdue ? 'HIGH' : 'NORMAL',
  });

  try {
    await mail.sendReminder({
      to: user.email,
      subject: notification.title,
      text: `Hello ${user.fullName},\n\n${notification.message}\n\nSign in to Savikro to view your tasks.`,
    });
    notification.emailSent = true;
    notification.emailSentAt = now;
  } catch (error) {
    notification.emailError = error.message.slice(0, 500);
  }
  await notification.save();
  await Assignment.updateOne(
    { _id: assignment._id },
    { $inc: { remindersSent: 1 }, $set: { lastRemindedAt: now } }
  );
  return notification;
};

const findCandidates = async ({ scope, userIds, assignmentIds, automatic, now }) => {
  const match = buildMatch(scope);
  match.status = {
    $in: [Assignment.ASSIGNMENT_STATUS.PENDING, Assignment.ASSIGNMENT_STATUS.IN_PROGRESS, Assignment.ASSIGNMENT_STATUS.OVERDUE],
  };
  match.lastRemindedAt = { $not: { $gte: new Date(now.getTime() - DAY_MS) } };
  if (automatic) match.dueDate = { $lte: new Date(now.getTime() + THREE_DAYS_MS) };
  if (userIds && userIds.length) match.userId = { $in: userIds };
  if (assignmentIds && assignmentIds.length) match._id = { $in: assignmentIds };
  return Assignment.find(match).sort({ dueDate: 1 }).lean();
};

const sendReminders = async ({ scope, userIds = [], assignmentIds = [], automatic = false, actor = null, req = null, now = new Date() }) => {
  await markOverdue(now);
  const assignments = await findCandidates({ scope, userIds, assignmentIds, automatic, now });
  const users = await User.find({ _id: { $in: assignments.map((row) => row.userId) }, status: 'ACTIVE' })
    .select('fullName email')
    .lean();
  const usersById = new Map(users.map((user) => [user._id.toString(), user]));

  let sent = 0;
  let emailSent = 0;
  for (const assignment of assignments) {
    const user = usersById.get(assignment.userId.toString());
    if (!user) continue;
    // Sequential by design: sandbox SMTP services commonly throttle bursts.
    // eslint-disable-next-line no-await-in-loop
    const notification = await sendOne(assignment, user, now);
    sent += 1;
    if (notification.emailSent) emailSent += 1;
  }

  await audit.record({
    action: automatic ? AUDIT_ACTIONS.COMPLIANCE_OVERDUE_SWEEP : AUDIT_ACTIONS.COMPLIANCE_REMINDER_SENT,
    outcome: AUDIT_OUTCOME.SUCCESS,
    actorId: actor ? actor._id : null,
    actorRole: actor ? actor.role : 'SYSTEM',
    entityType: AUDIT_ENTITY_TYPE.ASSIGNMENT,
    metadata: { candidates: assignments.length, notificationsCreated: sent, emailsSent: emailSent },
    req,
  });

  return { matched: assignments.length, notificationsCreated: sent, emailsSent: emailSent };
};

const runNightlySweep = (now = new Date()) =>
  sendReminders({
    scope: { level: 'ORGANISATION', department: null, userId: null },
    automatic: true,
    now,
  });

module.exports = { DAY_MS, markOverdue, sendReminders, runNightlySweep };
