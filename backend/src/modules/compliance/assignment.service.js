const Assignment = require('../../models/Assignment');

const createAssignmentsForUsers = async ({ users, itemType, itemId, itemTitle, dueDate, source, sourceRef }) => {
  if (!users.length) return { created: 0, skipped: 0 };

  const operations = users.map((user) => ({
    updateOne: {
      filter: { userId: user._id, itemType, itemId },
      update: {
        $setOnInsert: {
          userId: user._id,
          department: user.department,
          userRole: user.role,
          itemType,
          itemId,
          itemTitle,
          dueDate,
          source,
          sourceRef: sourceRef || null,
        },
      },
      upsert: true,
    },
  }));

  const result = await Assignment.bulkWrite(operations, { ordered: false });
  const created = result.upsertedCount || 0;
  return { created, skipped: users.length - created };
};

const completeAssignment = (filter, completionRef, completedAt = new Date()) =>
  Assignment.findOneAndUpdate(
    { ...filter, status: { $ne: Assignment.ASSIGNMENT_STATUS.SUPERSEDED } },
    {
      $set: {
        status: Assignment.ASSIGNMENT_STATUS.COMPLETED,
        completionRef,
        completedAt,
        'progress.percentComplete': 100,
      },
    },
    { new: true }
  );

const supersedeItem = (itemType, itemId) =>
  Assignment.updateMany(
    { itemType, itemId, status: { $ne: Assignment.ASSIGNMENT_STATUS.SUPERSEDED } },
    { $set: { status: Assignment.ASSIGNMENT_STATUS.SUPERSEDED } }
  );

const refreshUserSnapshot = (user) =>
  Assignment.updateMany(
    { userId: user._id },
    { $set: { department: user.department, userRole: user.role } }
  );

const refreshItemTitle = (itemType, itemId, itemTitle) =>
  Assignment.updateMany({ itemType, itemId }, { $set: { itemTitle } });

module.exports = {
  createAssignmentsForUsers,
  completeAssignment,
  supersedeItem,
  refreshUserSnapshot,
  refreshItemTitle,
};
