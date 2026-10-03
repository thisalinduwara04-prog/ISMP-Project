import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import Alert from '../../components/Alert';
import Spinner from '../../components/Spinner';
import { fetchModule } from '../../api/training';

// The quiz half of the admin's read-only view, on its own page - reached from
// the "View the quiz" button at the end of the module's running order, the same
// way staff move from the content to the quiz in the player.
//
// Every option is listed with the correct ones marked. The answer key is here
// because this route is gated on TRAINING_AUTHOR and the API only returns
// `isCorrect` to an author (AD-3). Nothing on the page can be changed.

const QUESTION_TYPE_LABELS = {
  SINGLE_CHOICE: 'One correct answer',
  MULTI_CHOICE: 'Several correct answers',
  TRUE_FALSE: 'True or false',
};

const ModuleQuizKey = () => {
  const { moduleId } = useParams();

  const [module, setModule] = useState(null);
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
          <h1>Quiz</h1>
        </header>
        <Alert tone="error" title="Could not open this quiz">
          {error}
        </Alert>
      </div>
    );
  }

  if (!module) return <Spinner label="Loading…" />;

  const { quiz } = module;

  return (
    <div className="page">
      <header className="page__header">
        <Link to={`/training/modules/${module.id}/read`} className="btn btn--ghost btn--sm">
          ← {module.title}
        </Link>
        <h1>Quiz</h1>
        <p>
          {module.code} · {quiz.questions.length} question{quiz.questions.length === 1 ? '' : 's'}
        </p>
      </header>

      <div className="list-toolbar">
        <Link
          to={`/training/modules/${module.id}/read`}
          className="btn btn--primary btn--sm btn--wide"
        >
          Back to content
        </Link>
        <Link
          to={`/training/modules/${module.id}/edit`}
          className="btn btn--primary btn--sm btn--wide"
        >
          Edit module
        </Link>
      </div>

      <section className="card">
        <h2>Settings</h2>
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

export default ModuleQuizKey;
