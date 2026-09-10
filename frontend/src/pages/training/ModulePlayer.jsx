import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import Alert from '../../components/Alert';
import Spinner from '../../components/Spinner';
import MarkdownText from '../../components/MarkdownText';
import { fetchModule, markItemComplete, startAttempt } from '../../api/training';
import { formatDate, dueDescription } from '../../utils/format';

// UC-15 / US-022. Working through a module: the running order down the side,
// one item at a time in the main pane, and the quiz at the end.
//
// Every piece of state on this screen came from the server and goes back to it.
// Nothing is kept in localStorage or sessionStorage - which is not a style
// preference: progress has to survive someone finishing on a different device
// from the one they started on, and a warehouse terminal is shared, so state
// left in a browser would be both lost and visible to the next person.

const ModulePlayer = () => {
  const { moduleId } = useParams();
  const navigate = useNavigate();

  const [module, setModule] = useState(null);
  const [task, setTask] = useState(null);
  const [selected, setSelected] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchModule(moduleId);
      setModule(data.module);
      setTask(data.task);

      // Open at the first thing still to do, rather than making someone scroll
      // past what they have already finished to find where they were.
      const done = new Set(data.task?.completedItemIds || []);
      const next = data.module.contentItems.findIndex((item) => !done.has(item.itemId));
      setSelected(next === -1 ? 0 : next);
    } catch (loadError) {
      setError(loadError);
    }
  }, [moduleId]);

  useEffect(() => {
    load();
  }, [load]);

  const complete = async (itemId, advance) => {
    setBusy(true);
    setError(null);
    try {
      const data = await markItemComplete(moduleId, itemId);
      setTask(data.task);
      if (advance) setSelected((current) => Math.min(current + 1, module.contentItems.length - 1));
    } catch (completeError) {
      setError(completeError);
    } finally {
      setBusy(false);
    }
  };

  const openQuiz = async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await startAttempt(moduleId);
      navigate(`/training/attempts/${data.attempt.id}`);
    } catch (startError) {
      // The API refuses an early or exhausted attempt; the message says which,
      // and is worth showing rather than paraphrasing.
      setError(startError);
      setBusy(false);
    }
  };

  if (error && !module) {
    return (
      <div className="page">
        <header className="page__header">
          <h1>Training</h1>
        </header>
        <Alert tone="error" title="Could not open this module">
          {error.message}
        </Alert>
      </div>
    );
  }

  if (!module || !task) return <Spinner label="Loading…" />;

  const item = module.contentItems[selected];
  const done = new Set(task.completedItemIds);
  const isDone = item && done.has(item.itemId);
  const isLast = selected === module.contentItems.length - 1;
  const { quiz } = task;

  return (
    <div className="page">
      <header className="page__header">
        <Link to="/training" className="btn btn--ghost btn--sm">
          ← Training
        </Link>
        <h1>{module.title}</h1>
        <p>
          {module.code}
          {task.completedAt
            ? ` · Completed ${formatDate(task.completedAt)}`
            : ` · ${dueDescription(task.dueDate)}`}
        </p>
      </header>

      {error && (
        <Alert title="That did not work">
          {error.message}
        </Alert>
      )}

      {/* The progress bar is a real element rather than a styled div, so a
          screen reader announces it and the value is in the DOM. */}
      <section className="card progress">
        <div className="progress__head">
          <span className="field__label">
            {task.itemsCompleted} of {task.itemsTotal} sections complete
          </span>
          <span className="muted">{task.percentComplete}%</span>
        </div>
        <progress className="progress__bar" max="100" value={task.percentComplete}>
          {task.percentComplete}%
        </progress>
      </section>

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
                    {done.has(entry.itemId) ? '✓ Done' : `Section ${index + 1}`}
                  </span>
                  <span className="builder__item-title">{entry.title}</span>
                </button>
              </li>
            ))}
          </ol>

          {/* The quiz sits at the end of the running order, visibly locked with
              the reason on it rather than simply absent - so it is obvious
              what finishing the sections is FOR. The API refuses an early
              attempt regardless of what this button does. */}
          <div className="builder__add">
            {quiz.passed ? (
              <p className="muted builder__empty">
                Passed with {quiz.bestScorePercent}%. Nothing left to do.
              </p>
            ) : task.quizUnlocked ? (
              <button
                type="button"
                className="btn btn--primary btn--block"
                disabled={busy || quiz.attemptsRemaining === 0}
                onClick={openQuiz}
              >
                {quiz.activeAttemptId ? 'Resume the quiz' : 'Start the quiz'}
              </button>
            ) : (
              <p className="muted builder__empty">
                🔒 The quiz unlocks when all {task.itemsTotal} sections are complete —{' '}
                {task.itemsRemaining} to go.
              </p>
            )}

            {quiz.attemptsRemaining === 0 && !quiz.passed && (
              <p className="muted builder__empty">
                No attempts left. Ask your manager to reset them.
              </p>
            )}
          </div>
        </aside>

        <section className="card builder__pane">
          {!item ? (
            <p className="muted">This module has no content yet.</p>
          ) : (
            <>
              <div className="field__row">
                <h2>{item.title}</h2>
                {isDone && <span className="badge badge--ok">done</span>}
              </div>

              {/* Markdown for the written sections, a player for video, a link
                  for a PDF. `preload="metadata"` so a phone on 4G does not
                  download the whole file before the page is usable. */}
              {item.type === 'VIDEO' ? (
                <video className="player__video" src={item.mediaUrl} controls preload="metadata">
                  <track kind="captions" />
                  <a href={item.mediaUrl}>Download the video</a>
                </video>
              ) : item.type === 'PDF' ? (
                <p>
                  <a
                    className="btn btn--ghost"
                    href={item.mediaUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open the PDF
                  </a>
                </p>
              ) : (
                <div className="prose">
                  <MarkdownText>{item.body}</MarkdownText>
                </div>
              )}

              {/* Sticky on a phone: "Mark complete and continue" is the whole
                  loop, and it belongs under the thumb rather than below a
                  screen of reading (NFR-USE-02). */}
              <div className="confirm-actions actionbar">
                <button
                  type="button"
                  className="btn btn--primary"
                  disabled={busy}
                  onClick={() => complete(item.itemId, !isLast)}
                >
                  {busy
                    ? 'Saving…'
                    : isDone
                      ? isLast
                        ? 'Done'
                        : 'Next section'
                      : isLast
                        ? 'Mark complete'
                        : 'Mark complete and continue'}
                </button>

                {selected > 0 && (
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => setSelected(selected - 1)}
                  >
                    Back
                  </button>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      {/* The training record. Every attempt with its score, the best one
          marked, so somebody can see their own history without asking
          (US-024). */}
      {quiz.attempts.length > 0 && (
        <section className="card">
          <h2>Your attempts</h2>
          <ul className="version-list">
            {quiz.attempts.map((attempt) => (
              <li key={attempt.id} className="version-row">
                <span className="version-row__title">
                  Attempt {attempt.attemptNumber}
                  {attempt.isBest && ' · best'}
                </span>
                <span className="version-row__meta">
                  {formatDate(attempt.submittedAt)} · {attempt.scorePercent}% ·{' '}
                  {attempt.passed ? 'passed' : 'failed'}
                </span>
                <span className="version-row__actions">
                  <Link to={`/training/attempts/${attempt.id}`} className="btn btn--ghost btn--sm">
                    View
                  </Link>
                </span>
              </li>
            ))}
          </ul>
          <p className="muted">
            The best score is what counts: {quiz.bestScorePercent}% against a {quiz.passMark}% pass
            mark.
          </p>
        </section>
      )}
    </div>
  );
};

export default ModulePlayer;
