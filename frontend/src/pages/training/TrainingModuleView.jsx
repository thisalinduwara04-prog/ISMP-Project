import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getTrainingModule, submitQuiz } from '../../api/training';
import Loader from '../../components/Loader';
import Alert from '../../components/Alert';
import Badge from '../../components/Badge';

export default function TrainingModuleView() {
  const { id } = useParams();
  const [module, setModule] = useState(null);
  const [completion, setCompletion] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showQuiz, setShowQuiz] = useState(false);
  const [answers, setAnswers] = useState([]);
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getTrainingModule(id)
      .then((data) => {
        setModule(data.module);
        setCompletion(data.completion);
        setAnswers(new Array(data.module.quiz.length).fill(-1));
      })
      .catch((err) => setError(err.response?.data?.message || 'Failed to load module.'))
      .finally(() => setLoading(false));
  }, [id]);

  const selectAnswer = (qIdx, optIdx) => {
    setAnswers((prev) => {
      const next = [...prev];
      next[qIdx] = optIdx;
      return next;
    });
  };

  const handleSubmit = async () => {
    if (answers.some((a) => a === -1)) {
      setError('Please answer every question before submitting.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const data = await submitQuiz(id, answers);
      setResult(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit quiz.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Loader label="Loading module…" />;
  if (!module) return <Alert type="error">{error || 'Module not found.'}</Alert>;

  return (
    <div className="page page-narrow">
      <Link to="/training" className="back-link">
        ← Back to training
      </Link>

      <div className="page-header">
        <h1>{module.title}</h1>
        <div className="meta-row">
          <span className="muted">~{module.estimatedMinutes} min</span>
          {(result?.passed ?? completion?.passed) && <Badge tone="success">Passed</Badge>}
        </div>
      </div>

      <Alert type="error">{error}</Alert>

      {!showQuiz && !result && (
        <>
          <div className="card policy-content">
            <p>{module.content}</p>
            {module.mediaUrl && (
              <p>
                <a href={module.mediaUrl} target="_blank" rel="noreferrer">
                  Watch/open supporting material →
                </a>
              </p>
            )}
          </div>

          {module.quiz.length > 0 ? (
            <button className="btn btn-primary" onClick={() => setShowQuiz(true)}>
              {completion ? 'Retake quiz' : 'Start quiz'}
            </button>
          ) : (
            <p className="muted">This module has no quiz — reading the material is sufficient.</p>
          )}

          {completion && (
            <p className="muted">
              Last attempt: {completion.score}% ({completion.correctAnswers}/{completion.totalQuestions} correct){' '}
              {completion.passed ? '— passed' : '— not yet passed'}
            </p>
          )}
        </>
      )}

      {showQuiz && !result && (
        <div className="card">
          <h2>Quiz</h2>
          {module.quiz.map((q, qIdx) => (
            <fieldset key={qIdx} className="quiz-question">
              <legend>
                {qIdx + 1}. {q.questionText}
              </legend>
              {q.options.map((opt, optIdx) => (
                <label key={optIdx} className="quiz-option">
                  <input
                    type="radio"
                    name={`q${qIdx}`}
                    checked={answers[qIdx] === optIdx}
                    onChange={() => selectAnswer(qIdx, optIdx)}
                  />
                  {opt}
                </label>
              ))}
            </fieldset>
          ))}
          <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit answers'}
          </button>
        </div>
      )}

      {result && (
        <div className={`card result-card ${result.passed ? 'result-pass' : 'result-fail'}`}>
          <h2>{result.passed ? 'Well done — you passed!' : 'Not quite — try again'}</h2>
          <p>
            Score: {result.score}% ({result.correctAnswers}/{result.totalQuestions} correct)
          </p>
          {!result.passed && (
            <button
              className="btn btn-secondary"
              onClick={() => {
                setResult(null);
                setShowQuiz(true);
                setAnswers(new Array(module.quiz.length).fill(-1));
              }}
            >
              Retake quiz
            </button>
          )}
          <Link className="btn btn-secondary" to="/training">
            Back to training list
          </Link>
        </div>
      )}
    </div>
  );
}
