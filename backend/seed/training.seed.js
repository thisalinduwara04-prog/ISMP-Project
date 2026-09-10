/* eslint-disable no-console */
// M3-T8. The training half of the demo data.
//
// Added ALONGSIDE the account section rather than replacing it: seed.js creates
// the people, this creates what they have been asked to learn. It is called
// with the accounts that were just created, so it never has to guess who is who.
//
// What it is for: the whole M3 loop has to be demonstrable in a live demo
// without anybody sitting a quiz on stage (risk R-07). So it leaves behind two
// published modules, assignments in every state a dashboard can show, and a
// failed attempt followed by a passing retake - which is the one sequence that
// takes five minutes to produce by hand and proves the retake and best-score
// rules at a glance.

const mongoose = require('mongoose');

const TrainingModule = require('../src/models/TrainingModule');
const QuizAttempt = require('../src/models/QuizAttempt');
const Assignment = require('../src/models/Assignment');
const trainingService = require('../src/modules/training/training.service');
const assignmentService = require('../src/modules/assignment/assignment.service');
const { ROLES, DEPARTMENTS } = require('../src/constants/roles');
const { POLICY_CATEGORY } = require('../src/constants/policies');
const { ASSIGNMENT_ITEM_TYPE, ASSIGNMENT_STATUS } = require('../src/constants/assignments');
const { ATTEMPT_STATUS, MODULE_STATUS } = require('../src/constants/training');

const daysFromNow = (days) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

// --- The content ------------------------------------------------------------
//
// Real awareness material rather than lorem ipsum, and aimed at this client:
// Savikro's staff take supplier emails and issue customer quotations, so
// phishing recognition and safe handling of quotations are the two things worth
// training first.

const PHISHING_MODULE = {
  title: 'Recognising a phishing email',
  code: 'TRN-EML-001',
  description:
    'How to spot a fake email asking you to pay, click or hand something over — and what to do about it.',
  category: POLICY_CATEGORY.EMAIL_SECURITY,
  estimatedMinutes: 8,
  dueInDays: 14,
  // Everyone: anybody with an inbox can be phished.
  targetRoles: [],
  targetDepartments: [],
  contentItems: [
    {
      order: 1,
      type: 'WALKTHROUGH',
      title: 'Four things to check before you click',
      body: `## The sender is not the name

The display name on an email is typed by whoever sent it. \`Chamari Gunasekara\`
can be sent by anybody. What matters is the address behind it — and on a phone
you usually have to tap the name to see it at all.

## Look for these four things

1. **The address, not the name.** \`accounts@savikro-lk.com\` is not
   \`accounts@savikro.lk\`. One hyphen is the whole trick.
2. **Urgency.** "Before close of business", "the account will be suspended",
   "the supplier is chasing". Pressure exists to stop you checking.
3. **A change to payment details.** A supplier who emails new bank details is
   the single most expensive email this company can receive.
4. **An attachment or link you did not expect.** Especially an invoice or a
   quotation you were not waiting for.

## What to do

Do not reply to the email. Do not forward it to a colleague to ask — that just
spreads the click. Report it, and if it concerns money, phone the supplier on
the number you already hold, never a number in the email.`,
    },
    {
      order: 2,
      type: 'WALKTHROUGH',
      title: 'A real example, line by line',
      body: `## The email

> **From:** Sunil Rathnayake <sunil.rathnayake@savikro-lk.com>
> **Subject:** Urgent — updated bank details for today's payment run
>
> Hi, our bank has changed. Please use the account below for today's payment.
> I am in meetings so email only.

## What is wrong with it

- The domain is **savikro-lk.com**, not savikro.lk.
- It changes **payment details**.
- It creates **urgency** — today's payment run.
- It closes the one channel that would catch it: "email only".

Any one of those is worth a second look. All four together is a fraud attempt,
and it is the exact shape that has cost Sri Lankan SMEs real money.`,
    },
  ],
  quiz: {
    passMark: 70,
    maxAttempts: 3,
    timeLimitMinutes: null,
    shuffleQuestions: false,
    questions: [
      {
        order: 1,
        text: 'A supplier emails to say their bank details have changed. What do you do first?',
        type: 'SINGLE_CHOICE',
        options: [
          { text: 'Phone the supplier on the number you already hold and confirm.', isCorrect: true },
          { text: 'Reply to the email asking them to confirm.', isCorrect: false },
          { text: 'Forward it to a colleague to see what they think.', isCorrect: false },
          { text: 'Make the payment — the details are in writing.', isCorrect: false },
        ],
        explanation:
          'Verify out of band. Replying only reaches whoever sent it, and forwarding spreads the risk without answering the question.',
      },
      {
        order: 2,
        text: 'Which of these are warning signs in an email? Choose every one that applies.',
        type: 'MULTI_CHOICE',
        options: [
          { text: 'A sender domain that is nearly right but not quite.', isCorrect: true },
          { text: 'Pressure to act before the end of the day.', isCorrect: true },
          { text: 'A change to bank or payment details.', isCorrect: true },
          { text: 'The email has a signature block.', isCorrect: false },
        ],
        explanation:
          'The first three travel together in almost every payment fraud. A signature block is trivial to copy and proves nothing.',
      },
      {
        order: 3,
        text: 'Forwarding a suspicious email to a colleague is a safe way to check whether it is genuine.',
        type: 'TRUE_FALSE',
        options: [
          { text: 'True', isCorrect: false },
          { text: 'False', isCorrect: true },
        ],
        explanation:
          'It puts the same link in front of one more person. Report it instead — that is what the reporting route is for.',
      },
      {
        order: 4,
        text: 'The display name on an email tells you who really sent it.',
        type: 'TRUE_FALSE',
        options: [
          { text: 'True', isCorrect: false },
          { text: 'False', isCorrect: true },
        ],
        explanation:
          'The display name is typed by the sender and can say anything. Only the address behind it carries any weight.',
      },
      {
        order: 5,
        text: 'You clicked a link in an email and then realised it was suspicious. What is the right next step?',
        type: 'SINGLE_CHOICE',
        options: [
          { text: 'Report it straight away, even though you clicked.', isCorrect: true },
          { text: 'Say nothing unless something obviously goes wrong.', isCorrect: false },
          { text: 'Delete the email so it cannot be clicked again.', isCorrect: false },
        ],
        explanation:
          'Reporting early is what limits the damage. Nobody is in trouble for clicking; staying quiet is what turns a click into an incident.',
      },
    ],
  },
};

const QUOTATIONS_MODULE = {
  title: 'Handling customer quotations safely',
  code: 'TRN-DAT-001',
  description:
    'Customer pricing is commercial data. How to send a quotation without leaking it to the wrong person.',
  category: POLICY_CATEGORY.DATA_HANDLING,
  estimatedMinutes: 6,
  dueInDays: 21,
  // SALES only, so audience filtering is visible in the demo: a warehouse
  // account asking for this module by id gets 403, not a shorter list.
  targetRoles: [],
  targetDepartments: [DEPARTMENTS.SALES],
  contentItems: [
    {
      order: 1,
      type: 'VIDEO',
      title: 'Sending a quotation: what goes wrong',
      // A path under frontend/public/media, so the demo needs nothing hosted.
      // Any full URL works here too.
      mediaUrl: '/media/quotations.mp4',
      durationSeconds: 150,
    },
    {
      order: 2,
      type: 'ARTICLE',
      title: 'The three rules',
      body: `## 1. One customer per email

The commonest leak in this business is a quotation sent to two customers at
once, so each can see what the other pays. Send one email per customer, every
time, even when the quotation is identical.

## 2. Check the address after autocomplete

\`nimal@\` matches more than one contact. The address bar completing itself is
not the same as the address being right — read it before you send.

## 3. Pricing does not go to personal accounts

Not to a customer's personal address "because it is easier", and not to your
own so you can work on it at home. Quotations stay on company accounts.`,
    },
  ],
  quiz: {
    passMark: 70,
    maxAttempts: 3,
    timeLimitMinutes: 10,
    shuffleQuestions: false,
    questions: [
      {
        order: 1,
        text: 'You are sending the same quotation to two customers. How should it go out?',
        type: 'SINGLE_CHOICE',
        options: [
          { text: 'Two separate emails, one per customer.', isCorrect: true },
          { text: 'One email with both customers in the To field.', isCorrect: false },
          { text: 'One email with the second customer in BCC.', isCorrect: false },
        ],
        explanation:
          'Separate emails. BCC still risks a reply-all mistake, and the two customers must never see each other pricing.',
      },
      {
        order: 2,
        text: 'Which of these is acceptable? Choose every one that applies.',
        type: 'MULTI_CHOICE',
        options: [
          { text: 'Sending a quotation to the customer company address on file.', isCorrect: true },
          { text: 'Copying your manager on a quotation.', isCorrect: true },
          { text: 'Sending it to your own personal email to finish at home.', isCorrect: false },
          { text: 'Sending it to the customer personal address because it is quicker.', isCorrect: false },
        ],
        explanation:
          'Company accounts on both ends. Personal accounts put commercial data somewhere the company cannot control or retrieve.',
      },
      {
        order: 3,
        text: 'Autocomplete filling in an address means it is the right address.',
        type: 'TRUE_FALSE',
        options: [
          { text: 'True', isCorrect: false },
          { text: 'False', isCorrect: true },
        ],
        explanation:
          'Autocomplete matches on the first few letters and will happily offer last month\'s contact. Read the address before sending.',
      },
    ],
  },
};

// --- The seeding ------------------------------------------------------------

const seedTraining = async ({ admin, users, reset }) => {
  // The training section always clears what it OWNS, so re-running cannot leave
  // ledger rows pointing at modules that no longer exist. `--reset` goes
  // further and clears the evidence trail too, for a genuinely clean demo.
  await TrainingModule.deleteMany({});
  await Assignment.deleteMany({ itemType: ASSIGNMENT_ITEM_TYPE.TRAINING });
  // Through the driver: the model refuses to delete a graded attempt by design.
  await mongoose.connection.collection('quizattempts').deleteMany({});

  if (reset) {
    await mongoose.connection.collection('auditlogs').deleteMany({});
  }

  const created = [];

  for (const definition of [PHISHING_MODULE, QUOTATIONS_MODULE]) {
    // Through the real service, so publication fans the assignments out exactly
    // as it does in the application - one code path, not two.
    // eslint-disable-next-line no-await-in-loop
    const module = await TrainingModule.create({
      ...definition,
      status: MODULE_STATUS.DRAFT,
      createdBy: admin._id,
    });

    // eslint-disable-next-line no-await-in-loop
    const { publication } = await trainingService.publishModule(module._id, admin, null);
    created.push({ module: await TrainingModule.findById(module._id), publication });
  }

  const [phishing, quotations] = created.map((entry) => entry.module);

  // --- Assignments in a spread of states ------------------------------------
  //
  // Everything below acts on the phishing module, which everybody holds, so the
  // demo dashboard has something in every column.

  const byEmployeeId = new Map(users.map((user) => [user.employeeId, user]));
  const pick = (employeeId) => byEmployeeId.get(employeeId);

  const nimal = pick('SVK-020'); // Sales executive - the retake story
  const ishara = pick('SVK-021'); // Sales coordinator - partially through
  const warehouse = users.find(
    (user) => user.department === DEPARTMENTS.WAREHOUSE && user.role === ROLES.EMPLOYEE
  );
  const accounts = pick('SVK-024') || pick('SVK-023');

  // Partly through the content: the progress bar has something to show.
  if (ishara) {
    await assignmentService.updateProgress({
      userId: ishara._id,
      moduleId: phishing._id,
      completedItemId: phishing.contentItems[0].itemId,
      totalItems: phishing.contentItems.length,
    });
  }

  // Overdue, and materialised as such the way the nightly sweep would leave it.
  if (warehouse) {
    await Assignment.updateOne(
      { userId: warehouse._id, itemType: ASSIGNMENT_ITEM_TYPE.TRAINING, itemId: phishing._id },
      { $set: { status: ASSIGNMENT_STATUS.OVERDUE, dueDate: daysFromNow(-3) } }
    );
  }

  // Finished cleanly, first time: content complete, quiz passed.
  let completedAttempt = null;
  if (accounts) {
    for (const item of phishing.contentItems) {
      // eslint-disable-next-line no-await-in-loop
      await assignmentService.updateProgress({
        userId: accounts._id,
        moduleId: phishing._id,
        completedItemId: item.itemId,
        totalItems: phishing.contentItems.length,
      });
    }

    completedAttempt = await recordAttempt({
      user: accounts,
      module: phishing,
      attemptNumber: 1,
      correctCount: 5,
      startedAt: daysFromNow(-6),
    });

    await assignmentService.complete({
      userId: accounts._id,
      itemType: ASSIGNMENT_ITEM_TYPE.TRAINING,
      itemId: phishing._id,
      completionRef: completedAttempt._id,
      completedAt: completedAttempt.submittedAt,
    });
  }

  // --- The one sequence that is worth seeding: fail, then pass ---------------
  //
  // 40% first, 80% on the retake. It demonstrates in one screen that attempts
  // are kept, that the BEST score is what counts, and that a failure is
  // recoverable - none of which can be shown from a single passing attempt.
  let retake = null;
  if (nimal) {
    for (const item of phishing.contentItems) {
      // eslint-disable-next-line no-await-in-loop
      await assignmentService.updateProgress({
        userId: nimal._id,
        moduleId: phishing._id,
        completedItemId: item.itemId,
        totalItems: phishing.contentItems.length,
      });
    }

    await recordAttempt({
      user: nimal,
      module: phishing,
      attemptNumber: 1,
      correctCount: 2, // 40% - a fail against the 70% mark
      startedAt: daysFromNow(-4),
    });

    retake = await recordAttempt({
      user: nimal,
      module: phishing,
      attemptNumber: 2,
      correctCount: 4, // 80% - a pass
      startedAt: daysFromNow(-2),
    });

    await assignmentService.complete({
      userId: nimal._id,
      itemType: ASSIGNMENT_ITEM_TYPE.TRAINING,
      itemId: phishing._id,
      completionRef: retake._id,
      completedAt: retake.submittedAt,
    });

    // And part-way through the SALES-only module, so that one is not empty.
    await assignmentService.updateProgress({
      userId: nimal._id,
      moduleId: quotations._id,
      completedItemId: quotations.contentItems[0].itemId,
      totalItems: quotations.contentItems.length,
    });
  }

  return { created, retake, completedAttempt };
};

// Writes one graded attempt as the grading service would have left it: the
// first `correctCount` questions answered correctly, the rest wrong, scored
// against the pass mark as it stood at the time.
const recordAttempt = async ({ user, module, attemptNumber, correctCount, startedAt }) => {
  const questions = module.quiz.questions;

  const responses = questions.map((question, index) => {
    const correct = question.options.filter((option) => option.isCorrect);
    const wrong = question.options.filter((option) => !option.isCorrect);
    const answeredCorrectly = index < correctCount;

    return {
      questionId: question.questionId,
      selectedOptionIds: answeredCorrectly
        ? correct.map((option) => option.optionId)
        : [(wrong[0] || correct[0]).optionId],
      isCorrect: answeredCorrectly,
    };
  });

  const scorePercent = Math.round((correctCount / questions.length) * 100);

  const assignment = await Assignment.findOne({
    userId: user._id,
    itemType: ASSIGNMENT_ITEM_TYPE.TRAINING,
    itemId: module._id,
  });

  return QuizAttempt.create({
    userId: user._id,
    moduleId: module._id,
    attemptNumber,
    status: ATTEMPT_STATUS.SUBMITTED,
    startedAt,
    submittedAt: new Date(startedAt.getTime() + 6 * 60 * 1000),
    presentedQuestionIds: questions.map((question) => question.questionId),
    responses,
    totalQuestions: questions.length,
    correctCount,
    scorePercent,
    passMarkAtAttempt: module.quiz.passMark,
    passed: scorePercent >= module.quiz.passMark,
    assignmentId: assignment ? assignment._id : null,
  });
};

module.exports = { seedTraining };
