const mongoose = require('mongoose');

const Assignment = require('../../models/Assignment');
const User = require('../../models/User');
const AppError = require('../../utils/AppError');
const AppErrorCode = require('../../constants/appErrorCode');
const { NOT_FOUND } = require('../../constants/http');
const { SCOPE } = require('../../constants/permissions');

const CACHE_TTL_MS = 60_000;
const dashboardCache = new Map();

const percent = (completed, total) => (total ? Math.round((completed / total) * 1000) / 10 : 0);

const summarise = (rows) => {
  const total = rows.reduce((sum, row) => sum + row.total, 0);
  const completed = rows.reduce((sum, row) => sum + row.completed, 0);
  const overdue = rows.reduce((sum, row) => sum + row.overdue, 0);
  const policyRows = rows.filter((row) => row.itemType === Assignment.ITEM_TYPE.POLICY);
  const trainingRows = rows.filter((row) => row.itemType === Assignment.ITEM_TYPE.TRAINING);
  const typeSummary = (typeRows) => {
    const typeTotal = typeRows.reduce((sum, row) => sum + row.total, 0);
    const typeCompleted = typeRows.reduce((sum, row) => sum + row.completed, 0);
    return { total: typeTotal, completed: typeCompleted, percent: percent(typeCompleted, typeTotal) };
  };

  return {
    total,
    completed,
    outstanding: total - completed,
    overdue,
    compliancePercent: percent(completed, total),
    policy: typeSummary(policyRows),
    training: typeSummary(trainingRows),
  };
};

const applyScope = (match, scope) => {
  if (scope.level === SCOPE.SELF) match.userId = new mongoose.Types.ObjectId(scope.userId);
  if (scope.level === SCOPE.DEPARTMENT) match.department = scope.department;
  return match;
};

const buildMatch = (scope, filters = {}) => {
  const match = { status: { $ne: Assignment.ASSIGNMENT_STATUS.SUPERSEDED } };
  applyScope(match, scope);
  if (filters.department && scope.level === SCOPE.ORGANISATION) match.department = filters.department;
  if (filters.itemType) match.itemType = filters.itemType;
  if (filters.status) match.status = filters.status;
  if (filters.from || filters.to) {
    match.assignedAt = {};
    if (filters.from) match.assignedAt.$gte = new Date(filters.from);
    if (filters.to) {
      const end = new Date(filters.to);
      end.setUTCHours(23, 59, 59, 999);
      match.assignedAt.$lte = end;
    }
  }
  return match;
};

const aggregateRows = async (match) => {
  const rows = await Assignment.aggregate([
    { $match: match },
    {
      $group: {
        _id: { department: '$department', itemType: '$itemType' },
        total: { $sum: 1 },
        completed: {
          $sum: { $cond: [{ $eq: ['$status', Assignment.ASSIGNMENT_STATUS.COMPLETED] }, 1, 0] },
        },
        overdue: {
          $sum: { $cond: [{ $eq: ['$status', Assignment.ASSIGNMENT_STATUS.OVERDUE] }, 1, 0] },
        },
      },
    },
    { $sort: { '_id.department': 1, '_id.itemType': 1 } },
  ]);

  return rows.map((row) => ({
    department: row._id.department,
    itemType: row._id.itemType,
    total: row.total,
    completed: row.completed,
    overdue: row.overdue,
    compliancePercent: percent(row.completed, row.total),
  }));
};

const getDashboard = async (scope, filters = {}) => {
  const key = JSON.stringify({ scope, filters });
  const cached = dashboardCache.get(key);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) return { ...cached.value, cached: true };

  const aggregation = aggregateRows(buildMatch(scope, filters));
  let timeout;
  const timed = await Promise.race([
    aggregation.then((rows) => ({ rows })),
    new Promise((resolve) => { timeout = setTimeout(() => resolve({ timedOut: true }), 2000); }),
  ]);
  clearTimeout(timeout);
  if (timed.timedOut && cached) {
    // The old result is preferable to a dashboard that stalls. The still-live
    // aggregation is allowed to complete and refresh the cache for the next call.
    aggregation.then((rows) => {
      const departments = [...new Set(rows.map((row) => row.department))].map((department) => {
        const departmentRows = rows.filter((row) => row.department === department);
        return { department, ...summarise(departmentRows) };
      });
      dashboardCache.set(key, {
        cachedAt: Date.now(),
        value: { summary: summarise(rows), departments, asOf: new Date().toISOString(), cached: false },
      });
    }).catch(() => {});
    return { ...cached.value, cached: true, stale: true };
  }
  const rows = timed.timedOut ? await aggregation : timed.rows;
  const departments = [...new Set(rows.map((row) => row.department))].map((department) => {
    const departmentRows = rows.filter((row) => row.department === department);
    return { department, ...summarise(departmentRows) };
  });
  const value = {
    summary: summarise(rows),
    departments,
    asOf: new Date().toISOString(),
    cached: false,
  };
  dashboardCache.set(key, { cachedAt: Date.now(), value });
  return value;
};

const getPersonalCompliance = async (userId) => {
  const scope = { level: SCOPE.SELF, userId, department: null };
  const match = buildMatch(scope);
  const [rows, assignments] = await Promise.all([
    aggregateRows(match),
    Assignment.find(match).sort({ status: 1, dueDate: 1 }).lean(),
  ]);
  return { summary: summarise(rows), assignments };
};

const getOutstanding = async (scope, filters = {}, page = 1, pageSize = 20) => {
  if (filters.status === Assignment.ASSIGNMENT_STATUS.COMPLETED) {
    return { items: [], page, pageSize, total: 0 };
  }
  const match = buildMatch(scope, filters);
  match.status = filters.status
    ? filters.status
    : { $in: [Assignment.ASSIGNMENT_STATUS.PENDING, Assignment.ASSIGNMENT_STATUS.IN_PROGRESS, Assignment.ASSIGNMENT_STATUS.OVERDUE] };

  const grouped = await Assignment.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$userId',
        department: { $first: '$department' },
        outstandingCount: { $sum: 1 },
        overdueCount: {
          $sum: { $cond: [{ $eq: ['$status', Assignment.ASSIGNMENT_STATUS.OVERDUE] }, 1, 0] },
        },
        oldestDueDate: { $min: '$dueDate' },
        assignments: {
          $push: {
            id: '$_id',
            itemTitle: '$itemTitle',
            itemType: '$itemType',
            status: '$status',
            dueDate: '$dueDate',
          },
        },
      },
    },
    { $sort: { oldestDueDate: 1, _id: 1 } },
  ]);

  const userIds = grouped.map((row) => row._id);
  const users = await User.find({ _id: { $in: userIds } }).select('fullName employeeId email department').lean();
  const usersById = new Map(users.map((user) => [user._id.toString(), user]));
  const allItems = grouped.map((row) => ({ ...row, user: usersById.get(row._id.toString()) })).filter((row) => row.user);
  const start = (page - 1) * pageSize;
  return { items: allItems.slice(start, start + pageSize), page, pageSize, total: allItems.length };
};

const getUserCompliance = async (scope, userId) => {
  const user = await User.findById(userId).lean();
  if (!user) throw new AppError(NOT_FOUND, 'User not found.', AppErrorCode.NOT_FOUND);
  if (scope.level === SCOPE.SELF && user._id.toString() !== scope.userId.toString()) {
    throw new AppError(NOT_FOUND, 'User not found.', AppErrorCode.USER_OUT_OF_SCOPE);
  }
  if (scope.level === SCOPE.DEPARTMENT && user.department !== scope.department) {
    throw new AppError(NOT_FOUND, 'User not found.', AppErrorCode.USER_OUT_OF_SCOPE);
  }
  return { user, ...(await getPersonalCompliance(user._id)) };
};

const getReportRows = async (scope, filters = {}) => {
  const assignments = await Assignment.find(buildMatch(scope, filters)).sort({ department: 1, userId: 1, dueDate: 1 }).lean();
  const users = await User.find({ _id: { $in: assignments.map((row) => row.userId) } })
    .select('employeeId fullName email department role')
    .lean();
  const usersById = new Map(users.map((user) => [user._id.toString(), user]));
  return assignments.map((assignment) => ({ assignment, user: usersById.get(assignment.userId.toString()) })).filter((row) => row.user);
};

const clearDashboardCache = () => dashboardCache.clear();

module.exports = {
  percent,
  summarise,
  buildMatch,
  getDashboard,
  getPersonalCompliance,
  getOutstanding,
  getUserCompliance,
  getReportRows,
  clearDashboardCache,
};
