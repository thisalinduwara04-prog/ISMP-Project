import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import Alert from '../../components/Alert';
import Spinner from '../../components/Spinner';
import { fetchAttempt, saveAnswers, submitAttempt, startAttempt } from '../../api/training';
import { formatDate } from '../../utils/format';
import { useMediaQuery } from '../../utils/useMediaQuery';

// UC-16 / UC-17. One screen for one attempt, in whichever state the SERVER says
// it is in: a paper while it is IN_PROGRESS, a result once it has been graded.
// The client never decides which - reloading a submitted attempt shows the
// result, and no amount of going back in the browser reopens it.
//
// What is deliberately absent: any way to tell whether an answer is right
// before submitting. The options arrive without a key, so there is nothing in
// this file - or in the network tab - that could reveal one.

const countdown = (seconds) => {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
};

const QuizAttempt = () => {
  const { attemptId } = useParams();
  const navigate = useNavigate();

  const [attempt, setAttempt] = useState(null);
  const [result, setResult] = useState(null);
  const [quiz, setQuiz] = useState(null);
  const [answers, setAnswers] = useState({});
  const [remaining, setRemaining] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  // 'saved' | 'saving' | 'failed'. An answer that did not reach the server has
  // to say so - a quiz that silently drops answers is worse than one that
  // refuses them (NFR-USE-01).
  const [saveState, setSaveState] = useState('saved');

  // One question at a time on a phone, all of them on a desktop. On a 360px
  // screen a five-question paper is a scroll with no sense of progress, and the
  // submit button ends up a long way from the last answer.
  const oneAtATime = useMediaQuery('(max-width: 700px)');
  const [page, setPage] = useState(0);

  // Kept in a ref as well as in state so the expiry effect can submit without
  // being re-created on every keystroke.
  const submitting = useRef(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchAttempt(attemptId);
      setQuiz(data.quiz);

      if (data.result) {
        setResult(data.result);
        setAttempt(null);
        return;
      }

      setAttempt(data.attempt);
      setRemaining(data.attempt.secondsRemaining);
      setAnswers(
        Object.fromEntries(
          data.attempt.questions.map((question) => [question.questionId, question.selectedOptionIds])
        )
      );
    } catch (loadError) {
      setError(loadError);
    }
  }, [attemptId]);

  useEffect(() => {
    load();
  }, [load]);

  const send = useCallback(
    async (nextAnswers) => {
      // Saved as they are chosen, so a phone that dies mid-quiz has lost
      // nothing. A failure does not throw away the answer on screen - it is
      // carried by the next save and by submit - but it IS reported, because
      // somebody on a warehouse signal needs to know their answers are not
      // reaching the server before they get to the end.
      setSaveState('saving');
      try {
        await saveAnswers(
          attemptId,
          Object.entries(nextAnswers).map(([questionId, selectedOptionIds]) => ({
            questionId,
            selectedOptionIds,
          }))
        );
        setSaveState('saved');
      } catch {
        setSaveState('failed');
      }
    },
    [attemptId]
  );

  const choose = (question, optionId) => {
    const current = answers[question.questionId] || [];

    const next =
      question.type === 'MULTI_CHOICE'
        ? current.includes(optionId)
          ? current.filter((id) => id !== optionId)
          : [...current, optionId]
        : [optionId];

    const updated = { ...answers, [question.questionId]: next };
    setAnswers(updated);
    send(updated);
  };

  const submit = useCallback(async () => {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError(null);

    try {
      await send(answers);
      const data = await submitAttempt(attemptId);
      setResult(data.result);
      setQuiz(data.quiz);
      setAttempt(null);
    } catch (submitError) {
      setError(submitError);
      submitting.current = false;
    } finally {
      setBusy(false);
    }
  }, [answers, attemptId, send]);

  // The clock. The number shown counts down locally so it does not flicker,
  // but it is only ever a display of what the server said: when it reaches
  // zero this asks the server to settle the attempt, and the server decides
  // from its own clock whether the time really has run out.
  useEffect(() => {
    if (remaining === null || result) return undefined;

    if (remaining <= 0) {
      submit();
      return undefined;
    }

    const timer = setTimeout(() => setRemaining((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [remaining, result, submit]);

  const retake = async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await startAttempt(result.moduleId);
      navigate(`/training/attempts/${data.attempt.id}`);
    } catch (retakeError) {
      setError(retakeError);
      setBusy(false);
    }
  };

  if (error && !attempt && !result) {
    return (
      <div className="page page--narrow">
        <header className="page__header">
          <h1>Quiz</h1>
        </header>
        <Alert tone="error" title="Could not open this attempt">
          {error.message}
        </Alert>
      </div>
    );
  }

  if (!attempt && !result) return <Spinner label="Loading…" />;

  // --- The result -----------------------------------------------------------

  if (result) {
    return (
      <div className="page page--narrow">
        <header className="page__header">
          <Link to={`/training/modules/${result.moduleId}`} className="btn btn--ghost btn--sm">
            ← {result.moduleTitle}
          </Link>
          <h1>
            Attempt {result.attemptNumber}: {result.scorePercent}%
          </h1>
          <p>
            {result.correctCount} of {result.totalQuestions} correct · pass mark {result.passMark}%
            {result.submittedAt ? ` · ${formatDate(result.submittedAt)}` : ''}
          </p>
        </header>

        {error && <Alert title="That did not work">{error.message}</Alert>}

        {result.timedOut && (
          <Alert tone="warning" title="Time ran out">
            The attempt was submitted automatically when the time limit was reached. Anything left
            unanswered scored zero.
          </Alert>
        )}

        <Alert
          tone={result.passed ? 'success' : 'warning'}
          title={result.passed ? 'Passed' : 'Not passed this time'}
        >
          {result.passed ? (
            <>
              This module is now complete and recorded against your name.
              {result.bestScorePercent > result.scorePercent &&
                ` Your best score is ${result.bestScorePercent}%.`}
            </>
          ) : result.attemptsRemaining > 0 ? (
            <>
              You need {result.passMark}% to pass. You have {result.attemptsRemaining} attempt
              {result.attemptsRemaining === 1 ? '' : 's'} left — go back over the module and try
              again.
            </>
          ) : (
            <>
              That was your last attempt. Contact your manager to have your attempts reset.
            </>
          )}
        </Alert>

        <section className="card">
          <h2>Your answers</h2>
          <ul className="version-list">
            {result.questions.map((question) => (
              <li key={question.questionId} className="version-row">
                <span className="version-row__title">
                  {question.number}. {question.text}
                </span>
                <span className="version-row__meta">
                  You answered: {question.yourAnswer.join(', ') || 'nothing'}
                </span>
                {/* Right or wrong, and nothing more. Which option WOULD have
                    been right is never sent while a retake remains, or the
                    quiz would only test whether you had failed it once. */}
                {question.explanation && (
                  <span className="version-row__meta">{question.explanation}</span>
                )}
                <span className="version-row__actions">
                  <span className={`badge badge--${question.mark === 'CORRECT' ? 'ok' : 'danger'}`}>
                    {question.mark === 'CORRECT' ? 'correct' : 'incorrect'}
                  </span>
                </span>
              </li>
            ))}
          </ul>

          {!result.explanationsRevealed && (
            <p className="muted">
              Explanations appear once you pass, or after your final attempt.
            </p>
          )}
        </section>

        <section className="card">
          <div className="confirm-actions">
            {!result.passed && result.attemptsRemaining > 0 && (
              <button type="button" className="btn btn--primary" disabled={busy} onClick={retake}>
                {busy ? 'Starting…' : `Try again (${result.attemptsRemaining} left)`}
              </button>
            )}
            <Link to={`/training/modules/${result.moduleId}`} className="btn btn--ghost">
              Back to the module
            </Link>
          </div>
        </section>
      </div>
    );
  }

  // --- The paper ------------------------------------------------------------

  const answered = attempt.questions.filter(
    (question) => (answers[question.questionId] || []).length > 0
  ).length;

  return (
    <div className="page page--narrow">
      <header className="page__header">
        <h1>{attempt.moduleTitle}</h1>
        <p>
          Attempt {attempt.attemptNumber} · {attempt.totalQuestions} questions · pass mark{' '}
          {attempt.passMark}%
        </p>
      </header>

      {error && (
        <Alert title="That did not work">
          {error.message}
          {error.details?.length > 0 && (
            <ul className="alert__list">
              {error.details.map((detail) => (
                <li key={detail.field}>{detail.field.replace('question.', 'Question ')}</li>
              ))}
            </ul>
          )}
        </Alert>
      )}

      {remaining !== null && (
        <Alert tone={remaining < 60 ? 'warning' : 'info'} title={`Time left: ${countdown(remaining)}`}>
          The clock runs on the server. Closing this page does not stop it — when the time is up the
          attempt is submitted with whatever has been answered.
        </Alert>
      )}

      <section className="card progress">
        <div className="progress__head">
          <span className="field__label">
            {oneAtATime
              ? `Question ${page + 1} of ${attempt.questions.length}`
              : `${answered} of ${attempt.questions.length} answered`}
          </span>
          {/* Never silent: every answer says whether it reached the server. */}
          <span className="muted" aria-live="polite">
            {saveState === 'saving' && 'Saving…'}
            {saveState === 'saved' && 'Answers saved'}
            {saveState === 'failed' && 'Not saved — check your connection'}
          </span>
        </div>
        <progress className="progress__bar" max={attempt.questions.length} value={answered}>
          {answered}
        </progress>
      </section>

      {(oneAtATime ? [attempt.questions[page]] : attempt.questions)
        .filter(Boolean)
        .map((question) => (
          <section className="card qcard" key={question.questionId}>
            <fieldset className="fieldset">
              <legend className="field__label">
                {question.number}. {question.text}
              </legend>
              {question.type === 'MULTI_CHOICE' && (
                <p className="muted">Choose every answer that applies.</p>
              )}

              {/* Full-width rows rather than inline chips: on a phone an option
                  is something you tap, and a tap target the width of its text
                  is a target you miss. */}
              <div className="choice-stack">
                {question.options.map((option) => (
                  <label className="choice choice--block" key={option.optionId} htmlFor={option.optionId}>
                    <input
                      id={option.optionId}
                      type={question.type === 'MULTI_CHOICE' ? 'checkbox' : 'radio'}
                      name={question.questionId}
                      checked={(answers[question.questionId] || []).includes(option.optionId)}
                      onChange={() => choose(question, option.optionId)}
                    />
                    <span>{option.text}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </section>
        ))}

      {/* Sticky on a narrow screen, so the action is under the thumb rather
          than at the bottom of a scroll (NFR-USE-02). */}
      <section className="card actionbar">
        {oneAtATime ? (
          <div className="confirm-actions">
            <button
              type="button"
              className="btn btn--ghost"
              disabled={page === 0}
              onClick={() => setPage((current) => current - 1)}
            >
              Back
            </button>

            {page < attempt.questions.length - 1 ? (
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => setPage((current) => current + 1)}
              >
                Next question
              </button>
            ) : (
              <button
                type="button"
                className="btn btn--primary"
                disabled={busy || answered < attempt.questions.length}
                onClick={submit}
              >
                {busy ? 'Submitting…' : 'Submit answers'}
              </button>
            )}
          </div>
        ) : (
          <div className="confirm-actions">
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy || answered < attempt.questions.length}
              onClick={submit}
            >
              {busy ? 'Submitting…' : 'Submit answers'}
            </button>
            <Link to={`/training/modules/${attempt.moduleId}`} className="btn btn--ghost">
              Back to the module
            </Link>
          </div>
        )}

        {answered < attempt.questions.length && (
          <p className="muted">
            {attempt.questions.length - answered} question
            {attempt.questions.length - answered === 1 ? '' : 's'} still to answer. Your answers are
            saved as you go, so you can come back to this.
          </p>
        )}
      </section>
    </div>
  );
};

export default QuizAttempt;
