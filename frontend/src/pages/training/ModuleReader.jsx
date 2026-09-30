import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import Alert from '../../components/Alert';
import Spinner from '../../components/Spinner';
import ContentItemView from '../../components/ContentItemView';
import { fetchModule } from '../../api/training';
import { formatDate } from '../../utils/format';
import { DEPARTMENT_LABELS, POLICY_CATEGORY_LABELS, ROLE_LABELS } from '../../constants';

// The admin's read-only view of a module - the training counterpart of a
// policy's "Read". It shows the content exactly as staff see it, then the quiz
// with the correct options marked, and nothing on it can be changed. Editing
// stays on the builder, one deliberate click away, so looking at a live module
// cannot alter what staff are graded against by accident.
//
// The answer key is here because this route is gated on TRAINING_AUTHOR and the
// API only returns `isCorrect` to an author (AD-3).

const CONTENT_TYPE_LABELS = {
  ARTICLE: 'Article',
  WALKTHROUGH: 'Walkthrough',
  VIDEO: 'Video',
  PDF: 'PDF',
};

const QUESTION_TYPE_LABELS = {
  SINGLE_CHOICE: 'One correct answer',
  MULTI_CHOICE: 'Several correct answers',
  TRUE_FALSE: 'True or false',
};

const describeAudience = (module) => {
  const roles = module.targetRoles.map((role) => ROLE_LABELS[role] || role);
  const departments = module.targetDepartments.map((dept) => DEPARTMENT_LABELS[dept] || dept);
  if (roles.length === 0 && departments.length === 0) return 'Everyone';
  return [...roles, ...departments].join(', ');
};

const ModuleReader = () => {
  const { moduleId } = useParams();

  const [module, setModule] = useState(null);
  const [selected, setSelected] = useState(0);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchModule(moduleId);
      setModule(data.module);
    } catch (loadError) {
      setError(loadError.message);
    }
  }, [moduleId]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <div className="page">
        <header className="page__header">
          <h1>Training module</h1>
        </header>
        <Alert tone="error" title="Could not open this module">
          {error}
        </Alert>
      </div>
    );
  }

  if (!module) return <Spinner label="Loading…" />;

  const isPublished = module.status === 'PUBLISHED';
  const item = module.contentItems[selected];
  const { quiz } = module;

  return (
    <div className="page">
      <header className="page__header">
        <Link to="/training" className="btn btn--ghost btn--sm">
          ← Training
        </Link>
        <h1>{module.title}</h1>
        <p>
          {module.code}
          {isPublished
            ? ` · Published ${formatDate(module.publishedAt)}`
            : ' · Draft — not visible to staff'}
        </p>
      </header>

      <div className="list-toolbar">
        <Link to={`/training/modules/${module.id}/edit`} className="btn btn--primary btn--sm btn--wide">
          Edit module
        </Link>
      </div>

      <section className="card">
        <h2>Details</h2>
        <dl className="detail-list">
          <div>
            <dt>Category</dt>
            <dd>{POLICY_CATEGORY_LABELS[module.category] || module.category}</dd>
          </div>
          <div>
            <dt>Assigned to</dt>
            <dd>{describeAudience(module)}</dd>
          </div>
          <div>
            <dt>Days to complete</dt>
            <dd>{module.dueInDays}</dd>
          </div>
          <div>
            <dt>Description</dt>
            <dd>{module.description || <span className="muted">None</span>}</dd>
          </div>
        </dl>
      </section>

      {/* The same running order and pane as the player, minus the progress
          and completion buttons - this is what staff read, not a task. */}
      <h2>Content ({module.contentItems.length})</h2>
      <div className="builder">
        <aside className="builder__list">
          <ol>
            {module.contentItems.map((entry, index) => (
              <li
                key={entry.itemId}
                className={`builder__item${index === selected ? ' builder__item--active' : ''}`}
              >
                <button
                  type="button"
                  className="builder__item-main"
                  onClick={() => setSelected(index)}
                >
                  <span className="builder__item-type">
                    Section {index + 1} · {CONTENT_TYPE_LABELS[entry.type] || entry.type}
                  </span>
                  <span className="builder__item-title">{entry.title}</span>
                </button>
              </li>
            ))}
          </ol>
        </aside>

        <section className="card builder__pane">
          {!item ? (
            <p className="muted">This module has no content yet.</p>
          ) : (
            <>
              <h2>{item.title}</h2>
              <ContentItemView item={item} />
            </>
          )}
        </section>
      </div>

      <section className="card">
        <h2>Quiz</h2>
        <dl className="detail-list">
          <div>
            <dt>Pass mark</dt>
            <dd>{quiz.passMark}%</dd>
          </div>
          <div>
            <dt>Attempts allowed</dt>
            <dd>{quiz.maxAttempts}</dd>
          </div>
          <div>
            <dt>Time limit</dt>
            <dd>{quiz.timeLimitMinutes ? `${quiz.timeLimitMinutes} minutes` : 'Untimed'}</dd>
          </div>
          <div>
            <dt>Question order</dt>
            <dd>{quiz.shuffleQuestions ? 'Shuffled for each attempt' : 'As listed below'}</dd>
          </div>
        </dl>
      </section>

      {quiz.questions.length === 0 && (
        <section className="card">
          <p className="muted">This module has no questions yet.</p>
        </section>
      )}

      {quiz.questions.map((question, index) => (
        <section className="card qcard" key={question.questionId}>
          <div className="field__row">
            <span className="field__label">Question {index + 1}</span>
            <span className="muted">{QUESTION_TYPE_LABELS[question.type] || question.type}</span>
          </div>

          <p className="answer-question">{question.text}</p>

          <ul className="answer-list">
            {question.options.map((option) => (
              <li
                key={option.optionId}
                className={`answer-list__item${option.isCorrect ? ' answer-list__item--correct' : ''}`}
              >
                <span>{option.text}</span>
                {option.isCorrect && <span className="badge badge--ok">correct</span>}
              </li>
            ))}
          </ul>

          {question.explanation && (
            <p className="muted">
              <strong>Explanation:</strong> {question.explanation}
            </p>
          )}
        </section>
      ))}
    </div>
  );
};

export default ModuleReader;
