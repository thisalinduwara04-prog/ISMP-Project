/* eslint-disable no-console */
/**
 * Load the Savikro training modules held as Markdown in `seed/training/`.
 *
 * Run with:  npm run seed:training
 *
 * The Markdown files are the source of truth, the same arrangement as
 * `policies.seed.js`. Each file has YAML front matter (code, title, category,
 * audience, due days, quiz settings) and a body laid out as:
 *
 *   # Title
 *   > one-line description
 *   ## Part N: <content item title>
 *   *Type: ARTICLE · About 3 min*        <- item type and duration
 *   ...markdown body...
 *   ## Quiz
 *   ### Question N
 *   question text
 *   *Single choice* | *Multiple choice ...* | *True / False*
 *   - [x] **A.** a correct option
 *   - [ ] **B.** a wrong option
 *   **Why:** explanation
 *
 * The metadata table and "Contents" list are for people reading the file; the
 * application shows the same facts from the module's own fields, so they are
 * not imported.
 *
 * WHAT IT CHANGES
 * ---------------
 * Nothing is deleted. Modules are matched by code:
 *
 *   not in the database  -> created
 *   exists as a DRAFT    -> replaced from the file (a draft has no assignments
 *                           and no attempts, so nothing points at its items)
 *   exists, PUBLISHED or ARCHIVED -> skipped. Rewriting a live quiz would
 *                           change it under people part-way through it; edit
 *                           those in the module builder instead.
 *
 * Everything goes through training.service, so each module is validated by
 * the same Zod schema as the authoring API and the audit log records it.
 */

const fs = require('node:fs');
const path = require('node:path');

const env = require('../src/config/env');
const { connectDatabase, disconnectDatabase } = require('../src/config/db');
const redactUri = require('../src/utils/redactUri');

const TrainingModule = require('../src/models/TrainingModule');
const User = require('../src/models/User');
const trainingService = require('../src/modules/training/training.service');
const { createModuleSchema } = require('../src/modules/training/training.schemas');

const { ROLES, USER_STATUS } = require('../src/constants/roles');
const {
  MODULE_STATUS,
  QUESTION_TYPE,
  CONTENT_ITEM_TYPE,
  MEDIA_CONTENT_TYPES,
} = require('../src/constants/training');

const TRAINING_DIR = path.join(__dirname, 'training');

// ---------------------------------------------------------------------------
// Front matter
// ---------------------------------------------------------------------------
//
// Hand-rolled like the policy loader. The one addition is a single level of
// nesting, for the `quiz:` block.

const parseScalar = (raw) => {
  const value = raw.replace(/\s+#.*$/, '').trim();
  if (value.startsWith('[') && value.endsWith(']')) {
    return value
      .slice(1, -1)
      .split(',')
      .map((item) => item.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean);
  }
  if (value === 'null') return null;
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^\d+$/.test(value)) return Number(value);
  return value.replace(/^["']|["']$/g, '');
};

const parseFrontMatter = (source, file) => {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) throw new Error(`${file} has no front matter block.`);

  const meta = {};
  let parent = null;

  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const separator = line.indexOf(':');
    if (separator === -1) continue;

    const key = line.slice(0, separator).trim();
    const rest = line.slice(separator + 1);
    const indented = /^\s/.test(line);

    if (indented && parent) {
      meta[parent][key] = parseScalar(rest);
    } else if (!rest.trim()) {
      // `quiz:` with nothing after it opens a nested block.
      meta[key] = {};
      parent = key;
    } else {
      meta[key] = parseScalar(rest);
      parent = null;
    }
  }

  return { meta, body: match[2].replace(/\r\n/g, '\n') };
};

// ---------------------------------------------------------------------------
// Body
// ---------------------------------------------------------------------------

// Splits on `## ` headings. The text before the first one holds the title and
// the description.
const splitSections = (body) =>
  body.split(/^## /m).slice(1).map((chunk) => {
    const newline = chunk.indexOf('\n');
    return { heading: chunk.slice(0, newline).trim(), text: chunk.slice(newline + 1) };
  });

// Drops the `---` rule that separates sections in the file.
const tidy = (text) => text.replace(/\n-{3,}\s*$/, '').trim();

const TYPE_LINE = /^\*Type:\s*([A-Z]+)\s*·\s*About\s*([\d.]+)\s*min(.*)\*\s*$/m;

const parseContentItem = (section, file) => {
  const title = section.heading.replace(/^Part\s+\d+:\s*/, '').trim();
  const typeLine = section.text.match(TYPE_LINE);
  if (!typeLine) throw new Error(`${file}: "${section.heading}" has no *Type: ...* line.`);

  const type = typeLine[1];
  const minutes = Number(typeLine[2]);
  const item = {
    type,
    title,
    body: tidy(section.text.replace(TYPE_LINE, '')),
  };

  if (MEDIA_CONTENT_TYPES.includes(type)) {
    item.durationSeconds = Math.round(minutes * 60);
    // "Video URL: to be added" means there is no file yet. The module still
    // imports as a draft; publishing refuses it until a link is set.
    const url = (typeLine[3].match(/URL:\s*(\S+)/) || [])[1];
    if (url && (url.startsWith('http') || url.startsWith('/'))) item.mediaUrl = url;
  }

  return item;
};

const QUESTION_TYPES = [
  [/^\*Single choice\*$/, QUESTION_TYPE.SINGLE_CHOICE],
  [/^\*Multiple choice.*\*$/, QUESTION_TYPE.MULTI_CHOICE],
  [/^\*True \/ False\*$/, QUESTION_TYPE.TRUE_FALSE],
];

const parseQuestion = (chunk, file, number) => {
  const lines = chunk.split('\n').map((line) => line.trim());
  const typeIndex = lines.findIndex((line) => QUESTION_TYPES.some(([pattern]) => pattern.test(line)));
  if (typeIndex === -1) throw new Error(`${file}: question ${number} has no type line.`);

  const [, type] = QUESTION_TYPES.find(([pattern]) => pattern.test(lines[typeIndex]));
  const text = lines.slice(0, typeIndex).filter(Boolean).join(' ');

  // `- [x] **A.** text` for lettered options, `- [ ] **True**` for true/false,
  // where the bold word is the whole option.
  const options = lines
    .map((line) => line.match(/^- \[( |x)\] \*\*([^*]+)\*\*\s*(.*)$/))
    .filter(Boolean)
    .map(([, mark, label, rest]) => ({ text: rest.trim() || label.trim(), isCorrect: mark === 'x' }));

  const why = lines.find((line) => line.startsWith('**Why:**'));

  return {
    text,
    type,
    options,
    explanation: why ? why.replace('**Why:**', '').trim() : '',
  };
};

const parseQuiz = (section, file) =>
  section.text
    .split(/^### Question \d+\s*$/m)
    .slice(1)
    .map((chunk, index) => parseQuestion(chunk, file, index + 1));

// ---------------------------------------------------------------------------
// One file -> one module payload
// ---------------------------------------------------------------------------

const loadModuleFile = (file) => {
  const { meta, body } = parseFrontMatter(fs.readFileSync(path.join(TRAINING_DIR, file), 'utf8'), file);

  for (const field of ['code', 'title', 'category']) {
    if (!meta[field]) throw new Error(`${file} is missing "${field}" in its front matter.`);
  }

  const intro = body.split(/^## /m)[0];
  const description = (intro.match(/^>\s*(.+)$/m) || [])[1] || '';

  const sections = splitSections(body);
  const contentItems = sections
    .filter((section) => /^Part\s+\d+:/.test(section.heading))
    .map((section) => parseContentItem(section, file));

  const quizSection = sections.find((section) => section.heading === 'Quiz');
  const questions = quizSection ? parseQuiz(quizSection, file) : [];

  const quiz = meta.quiz || {};

  // Parsed through the authoring API's own schema, so a single-choice question
  // with two ticks, or an unknown category, fails here with the same message
  // the module builder would have shown.
  const payload = createModuleSchema.parse({
    code: meta.code,
    title: meta.title,
    category: meta.category,
    description: description.trim(),
    estimatedMinutes: meta.estimatedMinutes ?? null,
    targetRoles: meta.targetRoles || [],
    targetDepartments: meta.targetDepartments || [],
    dueInDays: meta.dueInDays,
    contentItems,
    quiz: {
      passMark: quiz.passMark,
      maxAttempts: quiz.maxAttempts,
      timeLimitMinutes: quiz.timeLimitMinutes ?? null,
      shuffleQuestions: quiz.shuffleQuestions === true,
      questions,
    },
  });

  return { file, payload, publish: meta.status === MODULE_STATUS.PUBLISHED };
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const run = async () => {
  const files = fs.readdirSync(TRAINING_DIR).filter((name) => name.endsWith('.md')).sort();
  if (files.length === 0) throw new Error(`No .md training files found in ${TRAINING_DIR}`);

  // Parse everything before touching the database, so one bad file stops the
  // run before any module has been written.
  const definitions = files.map(loadModuleFile);

  await connectDatabase();
  console.log(`[seed] Connected to ${redactUri(env.MONGO_URI)}\n`);

  // The audit trail should name a real person as the author.
  const admin = await User.findOne({ role: ROLES.ADMIN, status: USER_STATUS.ACTIVE });
  if (!admin) throw new Error('No active ADMIN user found to author these modules. Run `npm run seed` first.');

  for (const { payload, publish } of definitions) {
    const label = `       ${payload.code.padEnd(14)} ${payload.title.slice(0, 44).padEnd(45)}`;
    // eslint-disable-next-line no-await-in-loop
    const existing = await TrainingModule.findOne({ code: payload.code });

    if (existing && existing.status !== MODULE_STATUS.DRAFT) {
      console.log(`${label} skipped (${existing.status} - edit it in the builder)`);
      continue;
    }

    /* eslint-disable no-await-in-loop */
    const saved = existing
      ? await trainingService.updateModule(existing._id, payload, admin, null)
      : await trainingService.createModule(payload, admin, null);
    const id = existing ? existing._id : saved.id || saved._id;

    let outcome = existing ? 'updated, DRAFT' : 'created, DRAFT';
    if (publish) {
      const { publication } = await trainingService.publishModule(id, admin, null);
      outcome = `PUBLISHED → ${publication.assignedCount} staff`;
    }
    /* eslint-enable no-await-in-loop */

    const counts = `${payload.contentItems.length} items, ${payload.quiz.questions.length} questions`;
    const missingMedia = payload.contentItems.some(
      (item) => item.type === CONTENT_ITEM_TYPE.VIDEO && !item.mediaUrl
    );
    console.log(`${label} ${outcome} (${counts})${missingMedia ? ' - video link still needed' : ''}`);
  }

  console.log('\n[seed] Done. Drafts are not assigned to anyone until they are published from Training.\n');
  await disconnectDatabase();
};

run().catch(async (error) => {
  console.error('\n[seed] Failed:', error.message);
  console.error(error);
  await disconnectDatabase().catch(() => {});
  process.exit(1);
});
