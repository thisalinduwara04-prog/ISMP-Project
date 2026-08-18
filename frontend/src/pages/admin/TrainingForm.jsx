import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createTraining } from '../../api/training';
import Alert from '../../components/Alert';
import { ALL_ROLES, ROLE_LABELS, ROLES } from '../../constants';

const TARGETABLE_ROLES = ALL_ROLES.filter((r) => r !== ROLES.ADMIN);

const emptyQuestion = () => ({ questionText: '', options: ['', ''], correctOptionIndex: 0 });

export default function TrainingForm() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    title: '',
    description: '',
    content: '',
    mediaUrl: '',
    estimatedMinutes: 5,
    targetRoles: [],
    passingScorePercent: 70,
  });
  const [quiz, setQuiz] = useState([emptyQuestion()]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const update = (key) => (e) => {
    const value = e.target.type === 'number' ? Number(e.target.value) : e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
  };

  const toggleRole = (role) => {
    setForm((f) => ({
      ...f,
      targetRoles: f.targetRoles.includes(role)
        ? f.targetRoles.filter((r) => r !== role)
        : [...f.targetRoles, role],
    }));
  };

  const updateQuestion = (qIdx, patch) => {
    setQuiz((prev) => prev.map((q, i) => (i === qIdx ? { ...q, ...patch } : q)));
  };

  const updateOption = (qIdx, optIdx, value) => {
    setQuiz((prev) =>
      prev.map((q, i) => (i === qIdx ? { ...q, options: q.options.map((o, j) => (j === optIdx ? value : o)) } : q))
    );
  };

  const addOption = (qIdx) => {
    setQuiz((prev) => prev.map((q, i) => (i === qIdx ? { ...q, options: [...q.options, ''] } : q)));
  };

  const removeOption = (qIdx, optIdx) => {
    setQuiz((prev) =>
      prev.map((q, i) =>
        i === qIdx
          ? {
              ...q,
              options: q.options.filter((_, j) => j !== optIdx),
              correctOptionIndex: q.correctOptionIndex >= optIdx ? Math.max(0, q.correctOptionIndex - 1) : q.correctOptionIndex,
            }
          : q
      )
    );
  };

  const addQuestion = () => setQuiz((prev) => [...prev, emptyQuestion()]);
  const removeQuestion = (qIdx) => setQuiz((prev) => prev.filter((_, i) => i !== qIdx));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const module = await createTraining({ ...form, quiz });
      navigate('/admin/training', { replace: true, state: { createdId: module._id } });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create training module.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page page-narrow">
      <div className="page-header">
        <h1>New Training Module</h1>
      </div>

      <Alert type="error">{error}</Alert>

      <form className="card form-card" onSubmit={handleSubmit}>
        <label className="field">
          <span>Title</span>
          <input value={form.title} onChange={update('title')} required />
        </label>

        <label className="field">
          <span>Description</span>
          <input value={form.description} onChange={update('description')} />
        </label>

        <label className="field">
          <span>Content (short article / walkthrough text)</span>
          <textarea rows={6} value={form.content} onChange={update('content')} required minLength={10} />
        </label>

        <label className="field">
          <span>Media URL (optional video/walkthrough link)</span>
          <input value={form.mediaUrl} onChange={update('mediaUrl')} placeholder="https://…" />
        </label>

        <div className="field-row">
          <label className="field">
            <span>Estimated minutes</span>
            <input type="number" min={1} max={180} value={form.estimatedMinutes} onChange={update('estimatedMinutes')} />
          </label>
          <label className="field">
            <span>Passing score (%)</span>
            <input
              type="number"
              min={0}
              max={100}
              value={form.passingScorePercent}
              onChange={update('passingScorePercent')}
            />
          </label>
        </div>

        <label className="field">
          <span>Applies to (leave blank for all roles)</span>
          <div className="checkbox-row">
            {TARGETABLE_ROLES.map((r) => (
              <label key={r} className="checkbox-pill">
                <input type="checkbox" checked={form.targetRoles.includes(r)} onChange={() => toggleRole(r)} />
                {ROLE_LABELS[r]}
              </label>
            ))}
          </div>
        </label>

        <h2>Quiz</h2>
        {quiz.map((q, qIdx) => (
          <fieldset key={qIdx} className="quiz-builder-question">
            <legend>Question {qIdx + 1}</legend>
            <label className="field">
              <span>Question text</span>
              <input
                value={q.questionText}
                onChange={(e) => updateQuestion(qIdx, { questionText: e.target.value })}
                required
              />
            </label>
            {q.options.map((opt, optIdx) => (
              <div className="option-row" key={optIdx}>
                <input
                  type="radio"
                  name={`correct-${qIdx}`}
                  checked={q.correctOptionIndex === optIdx}
                  onChange={() => updateQuestion(qIdx, { correctOptionIndex: optIdx })}
                  title="Mark as correct answer"
                />
                <input
                  value={opt}
                  onChange={(e) => updateOption(qIdx, optIdx, e.target.value)}
                  placeholder={`Option ${optIdx + 1}`}
                  required
                />
                {q.options.length > 2 && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeOption(qIdx, optIdx)}>
                    ✕
                  </button>
                )}
              </div>
            ))}
            <div className="toolbar-actions">
              {q.options.length < 6 && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => addOption(qIdx)}>
                  + Add option
                </button>
              )}
              {quiz.length > 1 && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeQuestion(qIdx)}>
                  Remove question
                </button>
              )}
            </div>
          </fieldset>
        ))}
        <button type="button" className="btn btn-secondary" onClick={addQuestion}>
          + Add question
        </button>

        <button className="btn btn-primary" type="submit" disabled={submitting}>
          {submitting ? 'Creating…' : 'Create training module'}
        </button>
      </form>
    </div>
  );
}
