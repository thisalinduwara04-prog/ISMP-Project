import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import Alert from '../../components/Alert';
import Spinner from '../../components/Spinner';
import RichTextArea from '../../components/RichTextArea';
import CompletionTrail from './CompletionTrail';
import {
  fetchModule,
  createModule,
  updateModule,
  publishModule,
  deleteModule,
} from '../../api/training';
import {
  ROLES,
  ROLE_LABELS,
  DEPARTMENT_LABELS,
  POLICY_CATEGORY_LABELS,
} from '../../constants';

// UC-13 / US-018 to US-020. Two panes: the running order on the left, the
// editor for whichever item is selected on the right, and the quiz on its own
// tab because it is a different kind of work.
//
// Nothing here is a control. The correctness rules below (one correct option on
// a single-choice question, and so on) are shown so an admin is not made to
// discover them by submitting; the API enforces every one of them again, and
// refuses the request whoever is calling.

const ALL_ROLE_VALUES = Object.values(ROLES);
const ALL_DEPARTMENT_VALUES = Object.keys(DEPARTMENT_LABELS);

// Mirrors MAX_CONTENT_ITEMS / MAX_QUIZ_QUESTIONS in backend/src/constants/training.js.
// The server is the authority; these only stop the buttons offering something
// it would refuse.
const MAX_ITEMS = 10;
const MAX_QUESTIONS = 15;

const MARKDOWN_TYPES = ['ARTICLE', 'WALKTHROUGH'];

const CONTENT_TYPE_LABELS = {
  WALKTHROUGH: 'Walkthrough',
  ARTICLE: 'Article',
  VIDEO: 'Video',
  PDF: 'PDF',
};

// What the builder OFFERS to add. ARTICLE is deliberately absent: it and
// WALKTHROUGH are the same editor over the same markdown field, and two buttons
// for one thing is a choice an admin has to make for no reason. The type stays
// in the schema (7.8) and in the labels above, so an ARTICLE item created
// elsewhere - the seed script writes one - still displays and still edits.
const ADDABLE_CONTENT_TYPES = ['WALKTHROUGH', 'VIDEO', 'PDF'];

const QUESTION_TYPE_LABELS = {
  SINGLE_CHOICE: 'One correct answer',
  MULTI_CHOICE: 'Several correct answers',
  TRUE_FALSE: 'True or false',
};

// A key React can hold on to before the server has given the item its nanoid.
// Stripped from every payload - the API is strict about unknown fields, and
// this is ours, not its.
let localCounter = 0;
const localKey = () => {
  localCounter += 1;
  return `local-${localCounter}`;
};

const emptyModule = {
  title: '',
  category: 'EMAIL_SECURITY',
  description: '',
  estimatedMinutes: null,
  dueInDays: 21,
  targetRoles: [],
  targetDepartments: [],
  contentItems: [],
  quiz: {
    passMark: 70,
    maxAttempts: 3,
    timeLimitMinutes: null,
    shuffleQuestions: false,
    questions: [],
  },
};

const newContentItem = (type) => ({
  key: localKey(),
  itemId: null,
  type,
  title: '',
  body: '',
  mediaUrl: '',
  durationSeconds: null,
});

const newQuestion = (type = 'SINGLE_CHOICE') => ({
  key: localKey(),
  questionId: null,
  text: '',
  type,
  explanation: '',
  options:
    type === 'TRUE_FALSE'
      ? [
          { key: localKey(), optionId: null, text: 'True', isCorrect: true },
          { key: localKey(), optionId: null, text: 'False', isCorrect: false },
        ]
      : [
          { key: localKey(), optionId: null, text: '', isCorrect: true },
          { key: localKey(), optionId: null, text: '', isCorrect: false },
        ],
});

// The server's shape, given the local keys the editor needs to track rows.
const fromApi = (module) => ({
  title: module.title,
  category: module.category,
  description: module.description || '',
  estimatedMinutes: module.estimatedMinutes,
  dueInDays: module.dueInDays,
  targetRoles: module.targetRoles || [],
  targetDepartments: module.targetDepartments || [],
  contentItems: (module.contentItems || []).map((item) => ({
    key: localKey(),
    itemId: item.itemId,
    type: item.type,
    title: item.title || '',
    body: item.body || '',
    mediaUrl: item.mediaUrl || '',
    durationSeconds: item.durationSeconds,
  })),
  quiz: {
    passMark: module.quiz.passMark,
    maxAttempts: module.quiz.maxAttempts,
    timeLimitMinutes: module.quiz.timeLimitMinutes,
    shuffleQuestions: !!module.quiz.shuffleQuestions,
    questions: (module.quiz.questions || []).map((question) => ({
      key: localKey(),
      questionId: question.questionId,
      text: question.text,
      type: question.type,
      explanation: question.explanation || '',
      options: question.options.map((option) => ({
        key: localKey(),
        optionId: option.optionId,
        text: option.text,
        isCorrect: !!option.isCorrect,
      })),
    })),
  },
});

// Ids are echoed back so the server recognises each item and keeps its
// identity; the order is simply the order of the array. Local keys are dropped.
const toPayload = (draft) => ({
  title: draft.title.trim(),
  category: draft.category,
  description: draft.description.trim(),
  // No screen sets an estimate - the field is on the schema (7.8) but nothing
  // reads it back yet. Carried through so a value written elsewhere, by the
  // seed script say, survives an ordinary edit.
  estimatedMinutes: draft.estimatedMinutes ? Number(draft.estimatedMinutes) : null,
  dueInDays: Number(draft.dueInDays),
  targetRoles: draft.targetRoles,
  targetDepartments: draft.targetDepartments,
  contentItems: draft.contentItems.map((item) => ({
    ...(item.itemId ? { itemId: item.itemId } : {}),
    type: item.type,
    title: item.title.trim(),
    body: MARKDOWN_TYPES.includes(item.type) ? item.body : '',
    mediaUrl: MARKDOWN_TYPES.includes(item.type) ? '' : item.mediaUrl.trim(),
    // Nothing in this builder sets a duration - the field is on the schema
    // (7.8) but no screen reads it back yet. Carried through so a value set
    // elsewhere, by the seed script say, is not wiped by an ordinary edit:
    // saving replaces the whole array.
    durationSeconds: item.durationSeconds ? Number(item.durationSeconds) : null,
  })),
  quiz: {
    passMark: Number(draft.quiz.passMark),
    maxAttempts: Number(draft.quiz.maxAttempts),
    timeLimitMinutes: draft.quiz.timeLimitMinutes ? Number(draft.quiz.timeLimitMinutes) : null,
    shuffleQuestions: draft.quiz.shuffleQuestions,
    questions: draft.quiz.questions.map((question) => ({
      ...(question.questionId ? { questionId: question.questionId } : {}),
      text: question.text.trim(),
      type: question.type,
      explanation: question.explanation.trim(),
      options: question.options.map((option) => ({
        ...(option.optionId ? { optionId: option.optionId } : {}),
        text: option.text.trim(),
        isCorrect: option.isCorrect,
      })),
    })),
  },
});

// The same rules the API validates, stated in the admin's language so a
// publication is not refused by surprise. The server still decides.
const findProblems = (draft) => {
  const problems = [];

  if (draft.title.trim().length < 3) problems.push('The module needs a title.');
  if (draft.contentItems.length === 0) problems.push('Add at least one content item.');

  draft.contentItems.forEach((item, index) => {
    const label = item.title.trim() || `Item ${index + 1}`;
    // Present is enough for a section heading - "MS" is a real title. Only the
    // module's own title, which staff pick out of a task list, needs more.
    if (item.title.trim().length === 0) problems.push(`${label}: give it a title.`);
    if (MARKDOWN_TYPES.includes(item.type) && !item.body.trim()) {
      problems.push(`${label}: write the content.`);
    }
    if (!MARKDOWN_TYPES.includes(item.type) && !item.mediaUrl.trim()) {
      problems.push(`${label}: add the ${item.type === 'VIDEO' ? 'video' : 'PDF'} link.`);
    }
  });

  if (draft.quiz.questions.length === 0) {
    problems.push('A module cannot be published without a quiz — add at least one question.');
  }

  draft.quiz.questions.forEach((question, index) => {
    const label = `Question ${index + 1}`;
    if (question.text.trim().length < 3) problems.push(`${label}: write the question.`);
    if (question.options.some((option) => !option.text.trim())) {
      problems.push(`${label}: every option needs text.`);
    }

    const correct = question.options.filter((option) => option.isCorrect).length;
    if (question.type === 'SINGLE_CHOICE' && correct !== 1) {
      problems.push(`${label}: mark exactly one option correct.`);
    }
    if (question.type === 'MULTI_CHOICE' && correct < 1) {
      problems.push(`${label}: mark at least one option correct.`);
    }
    if (question.type === 'TRUE_FALSE' && question.options.length !== 2) {
      problems.push(`${label}: a true/false question has exactly two options.`);
    }
  });

  return problems;
};

// The API reports a failure against its own path - `contentItems.1.title` -
// which is accurate, zero-indexed, and no help to somebody looking at a form.
// This turns it into the name of the thing on screen.
const MODULE_FIELD_LABELS = {
  title: 'Module title',
  code: 'Module code',
  category: 'Category',
  description: 'Description',
  dueInDays: 'Days to complete it',
  estimatedMinutes: 'Estimated minutes',
  targetRoles: 'Roles',
  targetDepartments: 'Departments',
  contentItems: 'Content',
};

const ITEM_FIELD_LABELS = {
  title: 'title',
  body: 'content',
  mediaUrl: 'link',
  type: 'type',
};

const QUESTION_FIELD_LABELS = {
  text: 'question',
  options: 'options',
  type: 'answer type',
  explanation: 'explanation',
};

const describeField = (path = '') => {
  const [head, index, leaf] = path.split('.');

  if (head === 'contentItems' && index !== undefined) {
    const number = Number(index) + 1;
    return Number.isNaN(number)
      ? 'Content'
      : `Item ${number}${leaf ? ` — ${ITEM_FIELD_LABELS[leaf] || leaf}` : ''}`;
  }

  if (head === 'quiz') {
    const parts = path.split('.');
    if (parts[1] === 'questions' && parts[2] !== undefined) {
      const number = Number(parts[2]) + 1;
      const leafName = parts[3];
      return Number.isNaN(number)
        ? 'Quiz'
        : `Question ${number}${leafName ? ` — ${QUESTION_FIELD_LABELS[leafName] || leafName}` : ''}`;
    }
    return { passMark: 'Pass mark', maxAttempts: 'Attempts allowed', timeLimitMinutes: 'Time limit' }[
      parts[1]
    ] || 'Quiz';
  }

  return MODULE_FIELD_LABELS[path] || path;
};

// Which tab and which item the first problem is on, so a rejected save leaves
// the offending field in front of the admin rather than behind two clicks.
const locate = (path = '') => {
  const [head, index] = path.split('.');

  if (head === 'contentItems') {
    return { tab: 'content', item: Number.isNaN(Number(index)) ? null : Number(index) };
  }
  if (head === 'quiz') return { tab: 'quiz', item: null };
  // The module title sits above the tabs and is always visible; everything
  // else about the module lives on the settings tab.
  if (head === 'title') return { tab: null, item: null };
  return { tab: 'settings', item: null };
};

const move = (list, from, to) => {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
};

const ModuleBuilder = () => {
  const { moduleId } = useParams();
  const navigate = useNavigate();
  const isNew = !moduleId;

  const [draft, setDraft] = useState(emptyModule);
  const [saved, setSaved] = useState(null); // the server's own view, for status
  const [tab, setTab] = useState('content');
  const [selected, setSelected] = useState(0);
  const [dragIndex, setDragIndex] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const [confirmingPublish, setConfirmingPublish] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // The second confirmation, reached only when the API has refused the first
  // because there are quiz attempts that would be destroyed.
  const [confirmingEvidenceLoss, setConfirmingEvidenceLoss] = useState(false);

  const load = useCallback(async () => {
    if (isNew) return;
    setError(null);
    try {
      const data = await fetchModule(moduleId);
      setSaved(data.module);
      setDraft(fromApi(data.module));
    } catch (loadError) {
      setError(loadError);
    }
  }, [moduleId, isNew]);

  useEffect(() => {
    load();
  }, [load]);

  const patchDraft = (changes) => setDraft((current) => ({ ...current, ...changes }));
  const patchQuiz = (changes) =>
    setDraft((current) => ({ ...current, quiz: { ...current.quiz, ...changes } }));

  const toggle = (field, value) =>
    setDraft((current) => ({
      ...current,
      [field]: current[field].includes(value)
        ? current[field].filter((entry) => entry !== value)
        : [...current[field], value],
    }));

  const setAll = (field, values) =>
    setDraft((current) => ({
      ...current,
      [field]: current[field].length === values.length ? [] : [...values],
    }));

  // --- Content items ---

  const addItem = (type) => {
    setDraft((current) => ({ ...current, contentItems: [...current.contentItems, newContentItem(type)] }));
    setSelected(draft.contentItems.length);
  };

  const patchItem = (index, changes) =>
    setDraft((current) => ({
      ...current,
      contentItems: current.contentItems.map((item, i) => (i === index ? { ...item, ...changes } : item)),
    }));

  const removeItem = (index) => {
    setDraft((current) => ({
      ...current,
      contentItems: current.contentItems.filter((unused, i) => i !== index),
    }));
    setSelected((current) => Math.max(0, current > index ? current - 1 : current));
  };

  // Reordering keeps each item's id, so an employee who has already completed
  // item three still has completed item three afterwards.
  const moveItem = (from, to) => {
    if (to < 0 || to >= draft.contentItems.length) return;
    setDraft((current) => ({ ...current, contentItems: move(current.contentItems, from, to) }));
    setSelected(to);
  };

  // --- Questions ---

  const addQuestion = () =>
    setDraft((current) => ({
      ...current,
      quiz: { ...current.quiz, questions: [...current.quiz.questions, newQuestion()] },
    }));

  const patchQuestion = (index, changes) =>
    setDraft((current) => ({
      ...current,
      quiz: {
        ...current.quiz,
        questions: current.quiz.questions.map((question, i) =>
          i === index ? { ...question, ...changes } : question
        ),
      },
    }));

  const removeQuestion = (index) =>
    setDraft((current) => ({
      ...current,
      quiz: {
        ...current.quiz,
        questions: current.quiz.questions.filter((unused, i) => i !== index),
      },
    }));

  const moveQuestion = (from, to) =>
    setDraft((current) => ({
      ...current,
      quiz: { ...current.quiz, questions: move(current.quiz.questions, from, to) },
    }));

  // Switching to true/false replaces the options rather than leaving three of
  // them behind for the API to reject.
  const changeQuestionType = (index, type) => {
    const question = draft.quiz.questions[index];

    if (type === 'TRUE_FALSE') {
      patchQuestion(index, { type, options: newQuestion('TRUE_FALSE').options });
      return;
    }

    // Coming back from true/false, or from multi to single: keep at most one
    // correct option so the state is one the API would accept.
    const options =
      type === 'SINGLE_CHOICE'
        ? question.options.map((option, i) => ({
            ...option,
            isCorrect: i === question.options.findIndex((o) => o.isCorrect),
          }))
        : question.options;

    patchQuestion(index, { type, options });
  };

  const patchOption = (questionIndex, optionIndex, changes) => {
    const question = draft.quiz.questions[questionIndex];
    const single = question.type !== 'MULTI_CHOICE';

    patchQuestion(questionIndex, {
      options: question.options.map((option, i) => {
        if (i === optionIndex) return { ...option, ...changes };
        // One correct answer means selecting one clears the others, the way a
        // radio group behaves.
        if (single && changes.isCorrect === true) return { ...option, isCorrect: false };
        return option;
      }),
    });
  };

  const addOption = (questionIndex) => {
    const question = draft.quiz.questions[questionIndex];
    patchQuestion(questionIndex, {
      options: [...question.options, { key: localKey(), optionId: null, text: '', isCorrect: false }],
    });
  };

  const removeOption = (questionIndex, optionIndex) => {
    const question = draft.quiz.questions[questionIndex];
    if (question.options.length <= 2) return;
    patchQuestion(questionIndex, {
      options: question.options.filter((unused, i) => i !== optionIndex),
    });
  };

  // --- Save and publish ---

  // A rejected save should leave the offending field on screen. Without this an
  // admin is told "Item 2 — title" while looking at the quiz tab, and has to go
  // and find it.
  const showFirstProblem = (failure) => {
    const [first] = failure?.details || [];
    if (!first) return;

    const { tab: target, item } = locate(first.field);
    if (target) setTab(target);
    if (item !== null && item !== undefined) setSelected(item);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    setWarnings([]);

    try {
      if (isNew) {
        const data = await createModule(toPayload(draft));
        navigate(`/training/modules/${data.module.id}/edit`, { replace: true });
        return;
      }

      const data = await updateModule(moduleId, toPayload(draft));
      setSaved(data.module);
      setDraft(fromApi(data.module));
      setWarnings(data.warnings || []);
      setNotice('Saved.');
    } catch (saveError) {
      setError(saveError);
      showFirstProblem(saveError);
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    setBusy(true);
    setError(null);

    try {
      // Publishes what was last SAVED, so unsaved edits go up first - otherwise
      // an admin publishes a module that is not the one on their screen.
      const saveResult = await updateModule(moduleId, toPayload(draft));
      setSaved(saveResult.module);

      await publishModule(moduleId);

      // Straight back to the list. The module's status badge is the
      // confirmation that it went out.
      navigate('/training', { replace: true });
    } catch (publishError) {
      setError(publishError);
      showFirstProblem(publishError);
      setConfirmingPublish(false);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError(null);

    try {
      await deleteModule(moduleId);
      navigate('/training', { replace: true });
    } catch (deleteError) {
      // 409 with a count: the module holds quiz attempts, and the API will not
      // destroy evidence on an unqualified request. The admin is told exactly
      // what would be lost and has to say so again.
      if (deleteError.status === 409) {
        setError(deleteError);
        setConfirmingDelete(false);
        setConfirmingEvidenceLoss(true);
      } else {
        setError(deleteError);
        setConfirmingDelete(false);
      }
      setBusy(false);
    }
  };

  const removeWithEvidence = async () => {
    setBusy(true);
    setError(null);

    try {
      await deleteModule(moduleId, true);
      navigate('/training', { replace: true });
    } catch (deleteError) {
      setError(deleteError);
      setConfirmingEvidenceLoss(false);
      setBusy(false);
    }
  };

  if (error && !saved && !isNew) {
    return (
      <div className="page">
        <header className="page__header">
          <h1>Training module</h1>
        </header>
        <Alert tone="error" title="Could not open this module">
          {error.message}
        </Alert>
      </div>
    );
  }

  if (!isNew && !saved) return <Spinner label="Loading…" />;

  const problems = findProblems(draft);
  const isPublished = saved?.status === 'PUBLISHED';
  const item = draft.contentItems[selected];
  const allRoles = draft.targetRoles.length === ALL_ROLE_VALUES.length;
  const allDepartments = draft.targetDepartments.length === ALL_DEPARTMENT_VALUES.length;

  return (
    <div className="page">
      <header className="page__header">
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => navigate('/training')}>
          ← Training modules
        </button>
        <h1>{isNew ? 'New training module' : draft.title || saved.code}</h1>
        <p>
          {isNew
            ? 'Saved as a draft — nobody is assigned it until you publish.'
            : `${saved.code} · ${isPublished ? 'published' : 'draft, not visible to staff'}`}
        </p>
      </header>

      {notice && <Alert tone="success">{notice}</Alert>}

      {warnings.map((warning) => (
        <Alert key={warning} tone="warning" title="Saved, with one thing to know">
          {warning}
        </Alert>
      ))}

      {error && (
        <Alert title={error.details?.length ? 'Not saved — a few things to fix' : 'That did not work'}>
          {error.details?.length ? null : error.message}
          {error.details?.length > 0 && (
            <ul className="alert__list">
              {error.details.map((detail) => (
                <li key={`${detail.field}-${detail.issue}`}>
                  <strong>{describeField(detail.field)}</strong>: {detail.issue}
                </li>
              ))}
            </ul>
          )}
        </Alert>
      )}

      {isPublished && (
        <Alert tone="info" title="This module is live">
          Staff are working through it now. Editing the quiz changes what future attempts are graded
          against; results already recorded keep the pass mark they were graded against.
        </Alert>
      )}

      {/* Above the tabs, not inside one. The module's own title is required by
          the API on the very first save, and while it sat on the settings tab
          an admin could fill in a content item, press Save, and be told "a
          title is required" about a field they had never seen. */}
      <section className="card">
        <label className="field" htmlFor="m-title">
          <span className="field__label">Module title</span>
          <input
            id="m-title"
            className="field__input"
            value={draft.title}
            placeholder="Phishing awareness"
            onChange={(event) => patchDraft({ title: event.target.value })}
          />
          <small className="field__help">
            What staff see on their task list. Each content item below has its own title.
          </small>
        </label>
      </section>

      <div className="tabs" role="tablist">
        {[
          ['content', `Content (${draft.contentItems.length})`],
          ['quiz', `Quiz (${draft.quiz.questions.length})`],
          ['settings', 'Audience & settings'],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            className={`tab${tab === value ? ' tab--active' : ''}`}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* --- Content: the running order on the left, one editor on the right --- */}
      {tab === 'content' && (
        <div className="builder">
          <aside className="builder__list">
            <ol>
              {draft.contentItems.map((entry, index) => (
                <li
                  key={entry.key}
                  className={`builder__item${index === selected ? ' builder__item--active' : ''}`}
                  draggable
                  onDragStart={() => setDragIndex(index)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    if (dragIndex !== null && dragIndex !== index) moveItem(dragIndex, index);
                    setDragIndex(null);
                  }}
                >
                  <button
                    type="button"
                    className="builder__item-main"
                    onClick={() => setSelected(index)}
                  >
                    <span className="builder__item-type">{CONTENT_TYPE_LABELS[entry.type]}</span>
                    <span className="builder__item-title">
                      {entry.title || `Untitled ${CONTENT_TYPE_LABELS[entry.type].toLowerCase()}`}
                    </span>
                  </button>

                  {/* Buttons as well as dragging: a drag is not reachable from a
                      keyboard, and this screen has to work on a phone too. */}
                  <span className="builder__item-actions">
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      aria-label={`Move ${entry.title || 'item'} up`}
                      disabled={index === 0}
                      onClick={() => moveItem(index, index - 1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      aria-label={`Move ${entry.title || 'item'} down`}
                      disabled={index === draft.contentItems.length - 1}
                      onClick={() => moveItem(index, index + 1)}
                    >
                      ↓
                    </button>
                  </span>
                </li>
              ))}
            </ol>

            {draft.contentItems.length === 0 && (
              <p className="muted builder__empty">
                No content yet. Add a walkthrough people read, or a video they watch.
              </p>
            )}

            <div className="builder__add">
              {ADDABLE_CONTENT_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  className="btn btn--ghost btn--sm"
                  disabled={draft.contentItems.length >= MAX_ITEMS}
                  onClick={() => addItem(type)}
                >
                  + {CONTENT_TYPE_LABELS[type]}
                </button>
              ))}
            </div>
            {draft.contentItems.length >= MAX_ITEMS && (
              <small className="field__help">
                Ten items is the limit — a module is meant to be finished in one sitting.
              </small>
            )}
          </aside>

          <section className="card builder__pane">
            {!item ? (
              <p className="muted">Add a content item, then write it here.</p>
            ) : (
              <>
                <div className="field__row">
                  <span className="field__label">
                    Item {selected + 1} · {CONTENT_TYPE_LABELS[item.type]}
                  </span>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => removeItem(selected)}
                  >
                    Remove
                  </button>
                </div>

                <label className="field" htmlFor="item-title">
                  <span className="field__label">Title</span>
                  <input
                    id="item-title"
                    className="field__input"
                    value={item.title}
                    onChange={(event) => patchItem(selected, { title: event.target.value })}
                  />
                </label>

                {/* No type picker here. The type is chosen by the button that
                    added the item, and it decides which field this pane shows -
                    changing it afterwards would leave written text or a link
                    stranded on an item that no longer has a field for it. To
                    change the kind of an item, remove it and add the other. */}
                {MARKDOWN_TYPES.includes(item.type) ? (
                  <div className="field">
                    <span className="field__label" id="item-body-label">
                      Content
                    </span>
                    <RichTextArea
                      id="item-body"
                      value={item.body}
                      rows={12}
                      onChange={(body) => patchItem(selected, { body })}
                      placeholder={'## What to look for\n\n- The sender address\n- Urgency'}
                    />
                  </div>
                ) : (
                  <label className="field" htmlFor="item-media">
                    <span className="field__label">
                      {item.type === 'VIDEO' ? 'Video link' : 'PDF link'}
                    </span>
                    <input
                      id="item-media"
                      className="field__input"
                      value={item.mediaUrl}
                      placeholder="https://…"
                      onChange={(event) => patchItem(selected, { mediaUrl: event.target.value })}
                    />
                  </label>
                )}
              </>
            )}
          </section>
        </div>
      )}

      {/* --- Quiz --- */}
      {tab === 'quiz' && (
        <>
          <section className="card">
            <h2>Quiz settings</h2>
            <div className="choice-row">
              <label className="field" htmlFor="pass-mark">
                <span className="field__label">Pass mark (%)</span>
                <input
                  id="pass-mark"
                  type="number"
                  min="1"
                  max="100"
                  className="field__input field__input--short"
                  value={draft.quiz.passMark}
                  onChange={(event) => patchQuiz({ passMark: event.target.value })}
                />
              </label>

              <label className="field" htmlFor="max-attempts">
                <span className="field__label">Attempts allowed</span>
                <input
                  id="max-attempts"
                  type="number"
                  min="1"
                  max="10"
                  className="field__input field__input--short"
                  value={draft.quiz.maxAttempts}
                  onChange={(event) => patchQuiz({ maxAttempts: event.target.value })}
                />
              </label>

              <label className="field" htmlFor="time-limit">
                <span className="field__label">Time limit in minutes</span>
                <input
                  id="time-limit"
                  type="number"
                  min="1"
                  max="240"
                  placeholder="Untimed"
                  className="field__input field__input--short"
                  value={draft.quiz.timeLimitMinutes ?? ''}
                  onChange={(event) =>
                    patchQuiz({ timeLimitMinutes: event.target.value === '' ? null : event.target.value })
                  }
                />
              </label>
            </div>

            <label className="checkbox checkbox--inline" htmlFor="shuffle">
              <input
                id="shuffle"
                type="checkbox"
                checked={draft.quiz.shuffleQuestions}
                onChange={(event) => patchQuiz({ shuffleQuestions: event.target.checked })}
              />
              <span>Shuffle the questions for each attempt</span>
            </label>
          </section>

          {draft.quiz.questions.map((question, index) => (
            <section className="card qcard" key={question.key}>
              <div className="field__row">
                <span className="field__label">Question {index + 1}</span>
                <span className="builder__item-actions">
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    aria-label={`Move question ${index + 1} up`}
                    disabled={index === 0}
                    onClick={() => moveQuestion(index, index - 1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    aria-label={`Move question ${index + 1} down`}
                    disabled={index === draft.quiz.questions.length - 1}
                    onClick={() => moveQuestion(index, index + 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => removeQuestion(index)}
                  >
                    Remove
                  </button>
                </span>
              </div>

              <label className="field" htmlFor={`q-text-${question.key}`}>
                <span className="field__label">Question</span>
                <input
                  id={`q-text-${question.key}`}
                  className="field__input"
                  value={question.text}
                  onChange={(event) => patchQuestion(index, { text: event.target.value })}
                />
              </label>

              <label className="field" htmlFor={`q-type-${question.key}`}>
                <span className="field__label">Answer type</span>
                <select
                  id={`q-type-${question.key}`}
                  className="field__input"
                  value={question.type}
                  onChange={(event) => changeQuestionType(index, event.target.value)}
                >
                  {Object.entries(QUESTION_TYPE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="field">
                <span className="field__label">Options — tick the correct one</span>
                {question.options.map((option, optionIndex) => (
                  <div className="option-row" key={option.key}>
                    <input
                      type={question.type === 'MULTI_CHOICE' ? 'checkbox' : 'radio'}
                      name={`correct-${question.key}`}
                      checked={option.isCorrect}
                      aria-label={`Option ${optionIndex + 1} is correct`}
                      onChange={(event) =>
                        patchOption(index, optionIndex, { isCorrect: event.target.checked })
                      }
                    />
                    <input
                      className="field__input"
                      value={option.text}
                      aria-label={`Option ${optionIndex + 1} text`}
                      disabled={question.type === 'TRUE_FALSE'}
                      onChange={(event) =>
                        patchOption(index, optionIndex, { text: event.target.value })
                      }
                    />
                    {question.type !== 'TRUE_FALSE' && (
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        disabled={question.options.length <= 2}
                        aria-label={`Remove option ${optionIndex + 1}`}
                        onClick={() => removeOption(index, optionIndex)}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}

                {question.type !== 'TRUE_FALSE' && question.options.length < 6 && (
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => addOption(index)}
                  >
                    + Option
                  </button>
                )}
              </div>

              <label className="field" htmlFor={`q-why-${question.key}`}>
                <span className="field__label">Explanation (optional)</span>
                <textarea
                  id={`q-why-${question.key}`}
                  className="field__input field__input--area"
                  rows={2}
                  value={question.explanation}
                  onChange={(event) => patchQuestion(index, { explanation: event.target.value })}
                />
                <small className="field__help">
                  Shown only after a pass or the final attempt — never while someone still has a
                  retake left, and never in a response before then.
                </small>
              </label>
            </section>
          ))}

          <div className="list-toolbar">
            <button
              type="button"
              className="btn btn--ghost"
              disabled={draft.quiz.questions.length >= MAX_QUESTIONS}
              onClick={addQuestion}
            >
              + Add question
            </button>
          </div>
        </>
      )}

      {/* --- Audience and settings --- */}
      {tab === 'settings' && (
        <>
          <section className="card">
            {/* The title lives above the tabs, where it cannot be missed. */}
            <label className="field" htmlFor="m-category">
              <span className="field__label">Category</span>
              <select
                id="m-category"
                className="field__input"
                value={draft.category}
                onChange={(event) => patchDraft({ category: event.target.value })}
              >
                {Object.entries(POLICY_CATEGORY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field" htmlFor="m-description">
              <span className="field__label">Description</span>
              <textarea
                id="m-description"
                className="field__input field__input--area"
                rows={3}
                value={draft.description}
                onChange={(event) => patchDraft({ description: event.target.value })}
              />
            </label>

            <div className="choice-row">
              <label className="field" htmlFor="m-due">
                <span className="field__label">Days to complete it</span>
                <input
                  id="m-due"
                  type="number"
                  min="1"
                  max="365"
                  className="field__input field__input--short"
                  value={draft.dueInDays}
                  onChange={(event) => patchDraft({ dueInDays: event.target.value })}
                />
              </label>
            </div>
          </section>

          <section className="card">
            <h2>Who is this for?</h2>
            <p className="muted">
              Leave both empty for everyone. Otherwise a person must match{' '}
              <strong>a selected role and a selected department</strong>.
            </p>

            <fieldset className="fieldset">
              <div className="fieldset__head">
                <legend className="field__label">Roles</legend>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => setAll('targetRoles', ALL_ROLE_VALUES)}
                >
                  {allRoles ? 'Clear' : 'Select all'}
                </button>
              </div>
              <div className="choice-row">
                {ALL_ROLE_VALUES.map((role) => (
                  <label key={role} className="choice" htmlFor={`trole-${role}`}>
                    <input
                      id={`trole-${role}`}
                      type="checkbox"
                      checked={draft.targetRoles.includes(role)}
                      onChange={() => toggle('targetRoles', role)}
                    />
                    <span>{ROLE_LABELS[role]}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="fieldset">
              <div className="fieldset__head">
                <legend className="field__label">Departments</legend>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => setAll('targetDepartments', ALL_DEPARTMENT_VALUES)}
                >
                  {allDepartments ? 'Clear' : 'Select all'}
                </button>
              </div>
              <div className="choice-row">
                {Object.entries(DEPARTMENT_LABELS).map(([value, label]) => (
                  <label key={value} className="choice" htmlFor={`tdept-${value}`}>
                    <input
                      id={`tdept-${value}`}
                      type="checkbox"
                      checked={draft.targetDepartments.includes(value)}
                      onChange={() => toggle('targetDepartments', value)}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </section>
        </>
      )}

      {/* Who has actually done it, directly above the buttons that change it -
          so an admin editing a live quiz can see how many people have already
          been graded against the version they are about to change. */}
      {!isNew && <CompletionTrail moduleId={moduleId} refreshKey={saved?.updatedAt} />}

      <section className="card">
        <div className="confirm-actions">
          <button type="button" className="btn btn--ghost" disabled={busy} onClick={save}>
            {busy ? 'Saving…' : isNew ? 'Save draft' : 'Save'}
          </button>

          {!isNew && (
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy || problems.length > 0}
              onClick={() => setConfirmingPublish(true)}
            >
              {isPublished ? 'Publish again…' : 'Publish…'}
            </button>
          )}

          {/* Last, and away from the two buttons an admin presses often. The
              API refuses to destroy quiz attempts without an explicit
              confirmation, so the first press reports what would be lost. */}
          {!isNew && (
            <button
              type="button"
              className="btn btn--danger"
              disabled={busy}
              onClick={() => setConfirmingDelete(true)}
            >
              Delete…
            </button>
          )}
        </div>

        {isNew && <p className="muted">Save the draft before you can publish it.</p>}

        {!isNew && problems.length > 0 && (
          <>
            <p className="muted">Before this can be published:</p>
            <ul className="alert__list">
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          </>
        )}

        {confirmingPublish && (
          <Alert tone="warning" title={isPublished ? 'Publish again?' : 'Publish this module?'}>
            <ul className="alert__list">
              <li>Every targeted member of staff is assigned it, with {draft.dueInDays} days to finish it.</li>
              <li>
                Anyone who already holds this module keeps their progress — republishing only picks
                up people who did not have it.
              </li>
              <li>They complete it by scoring {draft.quiz.passMark}% or more on the quiz.</li>
            </ul>
            <p className="confirm-actions">
              <button type="button" className="btn btn--primary" disabled={busy} onClick={publish}>
                {busy ? 'Publishing…' : 'Yes, publish it'}
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                disabled={busy}
                onClick={() => setConfirmingPublish(false)}
              >
                Cancel
              </button>
            </p>
          </Alert>
        )}

        {confirmingDelete && (
          <Alert tone="error" title="Delete this module?">
            <ul className="alert__list">
              <li>The content and the quiz are removed permanently. This cannot be undone.</li>
              <li>
                Every quiz attempt sat against it goes too — the record of who passed it and what
                they scored.
              </li>
              <li>It disappears from the task list of everybody currently assigned it.</li>
            </ul>
            <p className="muted">
              To take a live module out of circulation while keeping the record, leave it published
              and stop assigning it rather than deleting it.
            </p>
            <p className="confirm-actions">
              <button type="button" className="btn btn--danger" disabled={busy} onClick={remove}>
                {busy ? 'Deleting…' : 'Yes, delete it'}
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                disabled={busy}
                onClick={() => setConfirmingDelete(false)}
              >
                Cancel
              </button>
            </p>
          </Alert>
        )}

        {/* Only ever shown because the API refused the first attempt: this
            module holds results, and the message above says how many. */}
        {confirmingEvidenceLoss && (
          <Alert tone="error" title="This module holds quiz results">
            <p>
              Deleting it destroys them permanently. An audit entry recording who deleted what, and
              how much evidence went with it, is kept either way.
            </p>
            <p className="confirm-actions">
              <button
                type="button"
                className="btn btn--danger"
                disabled={busy}
                onClick={removeWithEvidence}
              >
                {busy ? 'Deleting…' : 'Delete it and the results'}
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                disabled={busy}
                onClick={() => setConfirmingEvidenceLoss(false)}
              >
                Keep the module
              </button>
            </p>
          </Alert>
        )}
      </section>
    </div>
  );
};

export default ModuleBuilder;
