/**
 * `assignments` ledger - service contract (T0).
 *
 * Spec: section 7.10, AD-2, NFR-MNT-01, risk R-03.
 *
 * WHO OWNS WHAT
 * -------------
 * M4 (Compliance & Reporting) owns the `assignments` collection: the Mongoose
 * model, the nightly OVERDUE sweep, the dashboard aggregations, and the bodies
 * of every function below.
 *
 * M2 (Policy) and M3 (Training) are the principal WRITERS of the ledger. They
 * publish items into it and close assignments as work completes, but they own
 * none of it. NFR-MNT-01 forbids one module's controller or service from
 * touching another module's model, so this file is the only doorway:
 *
 *      policy.service.js  ---> assignment.service.js ---> Assignment model
 *      training.service.js -/                              (owned by M4)
 *
 * A `require('../../models/Assignment')` anywhere inside the policy or
 * training modules is a defect, and is visible at a glance in an architecture
 * review. There is no exception for "just a quick count".
 *
 * WHAT IS IMPLEMENTED
 * -------------------
 * All of it except `updateProgress`, which is M3's and lands with T14. The
 * bodies were filled in by the task that first needed each one: `fanOut` and
 * `supersede` by T4 (publish), `findByUser` by T5 (my own state on the policy
 * list), `complete` by T6 (acknowledge).
 *
 * Changing a SIGNATURE here is a group decision, not a solo one - it breaks
 * two modules. Filling in a body is not.
 *
 * TRANSACTIONS
 * ------------
 * Every function accepts an optional `session`. Publishing a policy version
 * supersedes the old assignments and fans out the new ones, and those two
 * writes belong together. Callers on a replica set pass a session; on a
 * standalone development server they pass nothing and order the writes so a
 * crash leaves a recoverable state (see T4).
 *
 * DENORMALISED FIELDS (risk R-03)
 * -------------------------------
 * `department`, `userRole` and `itemTitle` are copied onto each assignment so
 * dashboards aggregate without a $lookup. They are therefore stale by
 * construction. Agreed ownership: M4 refreshes `department` and `userRole`
 * when a user transfers or changes role; the publishing module supplies
 * `itemTitle` at fan-out and M4 refreshes it when an item is renamed.
 */

/* eslint-disable no-unused-vars */

const Assignment = require('../../models/Assignment');
const User = require('../../models/User');
const AppAssert = require('../../utils/AppAssert');
const AppErrorCode = require('../../constants/appErrorCode');
const { BAD_REQUEST, NOT_FOUND } = require('../../constants/http');
const { addDays } = require('../../utils/date.util');
const { audienceUserFilter } = require('../../utils/audience');
const {
  ASSIGNMENT_STATUS,
  ASSIGNMENT_SOURCE,
  OPEN_ASSIGNMENT_STATUSES,
  ASSIGNMENT_ITEM_TYPE,
} = require('../../constants/assignments');

const NOT_IMPLEMENTED = 'assignment.service: not implemented (owned by M4)';

/**
 * Create one PENDING assignment per active user matching the audience, and
 * return what happened. Called when a policy version or a training module is
 * published (UC-08 step 6, UC-14 step 4).
 *
 * Audience rule, identical for both modules: a user matches when
 *   (roles is empty OR roles includes user.role)
 *   AND (departments is empty OR departments includes user.department)
 * An empty array means "everyone". Only ACTIVE users are assigned.
 *
 * MUST be a single bulk write, not a loop of saves - a publication to 200
 * warehouse staff is one round trip. MUST tolerate a user who already holds
 * an assignment for this item: the unique index on
 * `{ userId, itemType, itemId }` is the real guarantee, so use an unordered
 * bulk write and count duplicate-key errors as `skipped` rather than failing
 * the whole publication (T13).
 *
 * @param {Object} params
 * @param {'POLICY'|'TRAINING'} params.itemType
 * @param {import('mongoose').Types.ObjectId} params.itemId       policyVersionId for POLICY, moduleId for TRAINING
 * @param {string} params.itemTitle                               denormalised for report rows
 * @param {Object} params.audience
 * @param {string[]} params.audience.roles                        [] = all roles
 * @param {string[]} params.audience.departments                  [] = all departments
 * @param {number} params.dueInDays                               dueDate = assignedAt + dueInDays
 * @param {'PUBLICATION'|'MANUAL'|'REMEDIAL_SIMULATION'} [params.source='PUBLICATION']
 * @param {import('mongoose').Types.ObjectId} [params.sourceRef]  campaign id when source is REMEDIAL_SIMULATION
 * @param {import('mongoose').ClientSession} [params.session]
 * @returns {Promise<{assignedCount: number, skippedCount: number, userIds: import('mongoose').Types.ObjectId[]}>}
 *   `assignedCount` new documents, `skippedCount` users who already held one,
 *   `userIds` every targeted user - the caller uses it to send notifications
 *   and to record the target count in the audit entry.
 * @throws {AppError} 400 when the audience resolves to zero active users.
 *   Publishing to nobody is a mistake, not an empty success (UC-08 3a).
 */
const fanOut = async ({
  itemType,
  itemId,
  itemTitle,
  audience,
  dueInDays,
  source = ASSIGNMENT_SOURCE.PUBLICATION,
  sourceRef = null,
  session = null,
} = {}) => {
  const users = await User.find(audienceUserFilter(audience))
    .select('_id role department')
    .session(session)
    .lean();

  AppAssert(
    users.length > 0,
    BAD_REQUEST,
    'This audience matches no active users, so there is nobody to assign it to.',
    AppErrorCode.VALIDATION_ERROR
  );

  // Every assignment in one publication shares an instant, so due dates are
  // uniform rather than drifting by however long the write loop took.
  const assignedAt = new Date();
  const dueDate = addDays(assignedAt, dueInDays);

  // Upsert rather than insert. A plain insertMany would have to tolerate
  // duplicate-key errors for users who already hold the assignment, and inside
  // a transaction a write error aborts the WHOLE transaction - so "tolerating"
  // it would abort the publication. An upsert filtered on the unique key skips
  // an existing row silently and works identically in both modes (T13).
  const operations = users.map((user) => ({
    updateOne: {
      filter: { userId: user._id, itemType, itemId },
      update: {
        $setOnInsert: {
          department: user.department,
          userRole: user.role,
          itemTitle,
          status: ASSIGNMENT_STATUS.PENDING,
          assignedAt,
          dueDate,
          source,
          sourceRef,
          remindersSent: 0,
          createdAt: assignedAt,
          updatedAt: assignedAt,
          ...(itemType === ASSIGNMENT_ITEM_TYPE.TRAINING
            ? { progress: { completedItemIds: [], percentComplete: 0 } }
            : {}),
        },
      },
      upsert: true,
      // Managed explicitly above: letting Mongoose add them would $set
      // updatedAt on the rows we are deliberately leaving alone.
      timestamps: false,
    },
  }));

  const result = await Assignment.bulkWrite(operations, { ordered: false, session });
  const assignedCount = result.upsertedCount || 0;

  return {
    assignedCount,
    skippedCount: users.length - assignedCount,
    userIds: users.map((user) => user._id),
  };
};

/**
 * Close one user's assignment as COMPLETED. Called after an acknowledgement is
 * recorded (UC-10 step 5) and after a passing quiz attempt (UC-16 step 7).
 *
 * Idempotent: completing an already COMPLETED assignment returns the existing
 * document unchanged rather than moving `completedAt`, because the
 * acknowledge endpoint is itself idempotent and may reach here twice.
 *
 * @param {Object} params
 * @param {import('mongoose').Types.ObjectId} params.userId
 * @param {'POLICY'|'TRAINING'} params.itemType
 * @param {import('mongoose').Types.ObjectId} params.itemId
 * @param {import('mongoose').Types.ObjectId} params.completionRef  acknowledgement _id, or passing quizAttempt _id
 * @param {Date} [params.completedAt=new Date()]
 * @param {import('mongoose').ClientSession} [params.session]
 * @returns {Promise<Object|null>} the updated assignment, or null if the user
 *   held none. Null is not an error: an admin may complete an item outside
 *   their own assignment set. The caller decides whether to care.
 */
const complete = async ({
  userId,
  itemType,
  itemId,
  completionRef,
  completedAt = new Date(),
  session = null,
} = {}) => {
  const assignment = await Assignment.findOne({ userId, itemType, itemId }).session(session);
  if (!assignment) return null;

  // Idempotent. The acknowledge endpoint is itself idempotent and may reach
  // here twice; moving `completedAt` on the second call would falsify the
  // record of when the work was actually done.
  if (assignment.status === ASSIGNMENT_STATUS.COMPLETED) return assignment;

  assignment.status = ASSIGNMENT_STATUS.COMPLETED;
  assignment.completedAt = completedAt;
  assignment.completionRef = completionRef;
  await assignment.save({ session });

  return assignment;
};

/**
 * Move every still-open assignment for an item to SUPERSEDED, so it stops
 * counting against live compliance. Called when a new policy version is
 * published over an old one (UC-08 step 5) and when a policy is archived
 * (UC-11).
 *
 * Only PENDING, IN_PROGRESS and OVERDUE assignments move. COMPLETED ones are
 * left exactly as they are - they are the evidence that someone did the work
 * while the old version was current (BR-02). Acknowledgements are never
 * touched by this function or any other in this file.
 *
 * @param {Object} params
 * @param {'POLICY'|'TRAINING'} params.itemType
 * @param {import('mongoose').Types.ObjectId} params.itemId  the OLD policyVersionId / moduleId
 * @param {import('mongoose').ClientSession} [params.session]
 * @returns {Promise<{supersededCount: number}>}
 */
const supersede = async ({ itemType, itemId, session = null } = {}) => {
  // The status filter is the whole point: COMPLETED rows are untouched. Someone
  // who acknowledged v1 while v1 was current DID that work, and the record of
  // it survives the version being replaced (BR-02).
  const result = await Assignment.updateMany(
    { itemType, itemId, status: { $in: OPEN_ASSIGNMENT_STATUSES } },
    { $set: { status: ASSIGNMENT_STATUS.SUPERSEDED } },
    { session }
  );

  return { supersededCount: result.modifiedCount || 0 };
};

/**
 * Record that one training content item has been completed, and recompute the
 * percentage. Called by M3 as an employee works through a module (UC-15).
 *
 * Idempotent per item: pushing the same `completedItemId` twice leaves one
 * entry ($addToSet). On the first completed item the assignment moves from
 * PENDING to IN_PROGRESS and `startedAt` is set. Progress lives here, on the
 * server, so a user who starts on a warehouse terminal and finishes on their
 * phone resumes exactly where they stopped (US-022).
 *
 * This function does NOT complete the assignment at 100%. Reaching 100% only
 * unlocks the quiz; the assignment closes when the quiz is passed, via
 * `complete()`.
 *
 * @param {Object} params
 * @param {import('mongoose').Types.ObjectId} params.userId
 * @param {import('mongoose').Types.ObjectId} params.moduleId
 * @param {string} params.completedItemId    the nanoid `itemId` of the content item
 * @param {number} params.totalItems         module.contentItems.length, supplied by M3 so
 *                                           this service never reads the training model
 * @param {import('mongoose').ClientSession} [params.session]
 * @returns {Promise<{completedItemIds: string[], percentComplete: number, status: string}>}
 * @throws {AppError} 404 when the user holds no assignment for the module.
 */
const updateProgress = async ({
  userId,
  moduleId,
  completedItemId,
  totalItems,
  session = null,
} = {}) => {
  const assignment = await Assignment.findOne({
    userId,
    itemType: ASSIGNMENT_ITEM_TYPE.TRAINING,
    itemId: moduleId,
  }).session(session);

  AppAssert(
    assignment,
    NOT_FOUND,
    'This training module has not been assigned to you.',
    AppErrorCode.NOT_FOUND
  );

  // Idempotent by construction: a Set, not a push. Marking the same item
  // complete twice - a double tap, a retried request - leaves one entry.
  const completed = new Set(assignment.progress?.completedItemIds || []);
  completed.add(completedItemId);
  const completedItemIds = [...completed];

  // Capped at 100 because the two numbers can disagree: an admin who removes a
  // content item leaves progress records naming an item that is gone, and 5 of
  // 4 items must not read as 125% complete.
  const percentComplete =
    totalItems > 0 ? Math.min(100, Math.round((completedItemIds.length / totalItems) * 100)) : 0;

  assignment.progress = { completedItemIds, percentComplete };

  // First item done: PENDING becomes IN_PROGRESS. OVERDUE deliberately does
  // NOT - someone starting work that is already late is still late, and moving
  // it would quietly remove them from the figures a manager chases.
  if (assignment.status === ASSIGNMENT_STATUS.PENDING) {
    assignment.status = ASSIGNMENT_STATUS.IN_PROGRESS;
  }
  if (!assignment.startedAt) assignment.startedAt = new Date();

  await assignment.save({ session });

  return {
    completedItemIds,
    percentComplete,
    status: assignment.status,
    startedAt: assignment.startedAt,
  };
};

/**
 * Read one user's assignments. Used by M2 and M3 to answer "have I
 * acknowledged this?" and "where am I in this module?" on the list screens,
 * without either module querying the ledger itself.
 *
 * @param {import('mongoose').Types.ObjectId} userId
 * @param {Object} [filter]
 * @param {'POLICY'|'TRAINING'} [filter.itemType]
 * @param {string[]} [filter.status]        e.g. ['PENDING', 'OVERDUE']
 * @param {import('mongoose').Types.ObjectId[]} [filter.itemIds]  restrict to these items
 * @returns {Promise<Object[]>} plain assignment objects, newest due first.
 */
const findByUser = async (userId, filter = {}) => {
  const { itemType, status, itemIds } = filter;

  return Assignment.find({
    userId,
    ...(itemType ? { itemType } : {}),
    ...(status ? { status: { $in: status } } : {}),
    ...(itemIds ? { itemId: { $in: itemIds } } : {}),
  })
    .sort({ dueDate: 1 })
    .lean();
};

/**
 * Read every assignment for ONE item, newest due first. The mirror image of
 * `findByUser`, and the only way M2 can answer "who has not done this yet"
 * (UC-12) without querying the ledger itself.
 *
 * Deriving the outstanding list from here rather than from the users
 * collection is deliberate: the assignments ARE the record of who was asked.
 * Recomputing the audience from users would answer a subtly different
 * question - who would be targeted if it were published today - and would
 * quietly drop anyone who has since transferred or left.
 *
 * ADDED after the T0 contract meeting, for T8. Additive, so nothing already
 * written against this file breaks; still worth mentioning to M4.
 *
 * @param {Object} params
 * @param {'POLICY'|'TRAINING'} params.itemType
 * @param {import('mongoose').Types.ObjectId} params.itemId
 * @param {string[]} [params.status]        e.g. ['PENDING', 'OVERDUE'] - omit for all
 * @param {boolean} [params.withUser=false] populate userId with fullName, employeeId, department
 * @returns {Promise<Object[]>}
 */
const findByItem = async ({ itemType, itemId, status, withUser = false } = {}) => {
  const query = Assignment.find({
    itemType,
    itemId,
    ...(status ? { status: { $in: status } } : {}),
  }).sort({ dueDate: 1 });

  if (withUser) query.populate('userId', 'fullName employeeId department role');

  return query.lean();
};

/**
 * Permanently remove the ledger rows for items that no longer exist.
 *
 * Distinct from `supersede`, which CLOSES an assignment while keeping it in the
 * historical record. This deletes it outright, and exists only for the case
 * where the item itself has been destroyed - a policy deleted rather than
 * archived - because a ledger row pointing at a missing item would show up in
 * every dashboard as an unresolvable task.
 *
 * Anything short of that should call `supersede`.
 *
 * @param {Object} params
 * @param {'POLICY'|'TRAINING'} params.itemType
 * @param {import('mongoose').Types.ObjectId[]} params.itemIds
 * @param {import('mongoose').ClientSession} [params.session]
 * @returns {Promise<{deletedCount: number}>}
 */
const removeForItems = async ({ itemType, itemIds, session = null } = {}) => {
  const result = await Assignment.deleteMany(
    { itemType, itemId: { $in: itemIds } },
    { session }
  );

  return { deletedCount: result.deletedCount || 0 };
};

module.exports = {
  fanOut,
  complete,
  supersede,
  updateProgress,
  findByUser,
  findByItem,
  removeForItems,
};
