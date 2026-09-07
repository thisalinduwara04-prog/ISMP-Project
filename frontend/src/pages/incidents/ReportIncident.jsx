import { useState } from 'react';
import { Link } from 'react-router-dom';

import Alert from '../../components/Alert';
import Button from '../../components/Button';
import Field from '../../components/Field';
import FileInput from '../../components/FileInput';
import Select from '../../components/Select';
import Textarea from '../../components/Textarea';
import { submitIncident } from '../../api/incidents';
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_MAX_BYTES,
  INCIDENT_TYPE_HINTS,
  INCIDENT_TYPE_LABELS,
} from '../../constants';

const TYPE_OPTIONS = Object.entries(INCIDENT_TYPE_LABELS).map(([value, label]) => ({
  value,
  label,
}));

const EMPTY = { type: '', title: '', description: '', occurredAt: '', attachment: null };

// UC-22 / US-035. Deliberately short: type and description are the only
// required fields, because a form that takes a minute is a form people actually
// use when something has just gone wrong.
//
// There is no severity control anywhere on this page. The server derives it
// from the type (US-037) - an employee who has just lost a laptop should not
// also have to decide how bad that is.
const ReportIncident = () => {
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(null);

  const set = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const tooLarge = form.attachment && form.attachment.size > ATTACHMENT_MAX_BYTES;
  const canSubmit =
    form.type && form.title.trim().length >= 3 && form.description.trim().length >= 10 && !tooLarge;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const { incident } = await submitIncident(form);
      setSubmitted(incident);
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  };

  // UC-22 step 8: confirm with the reference, and say plainly that reporting is
  // the expected behaviour. People who fear blame stop reporting, and an
  // unreported incident is the expensive kind.
  if (submitted) {
    return (
      <div className="page">
        <Alert tone="success" title={`Report received — ${submitted.reference}`}>
          Thank you. Quote <strong>{submitted.reference}</strong> if you need to talk to IT about
          this. Reporting something that turns out to be harmless is exactly what this channel is
          for — it is never treated as an admission of fault.
        </Alert>

        <div className="card">
          <h1 className="section-title">What happens next</h1>
          <p className="prose">
            An administrator reviews every report. You can follow the status of this one, and see
            any notes added when it is resolved, on your reports page.
          </p>
          <div className="actions" style={{ marginTop: '1rem' }}>
            <Link to="/incidents" className="btn btn--primary">
              View my reports
            </Link>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                setSubmitted(null);
                setForm(EMPTY);
              }}
            >
              Report something else
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page__header">
        <h1>Report an incident</h1>
        <p>
          Tell us what happened. You do not need to be certain that it is a real problem — if
          something looked wrong, report it.
        </p>
      </header>

      <form className="card" onSubmit={handleSubmit} noValidate>
        {error && (
          <Alert title="Could not submit your report">
            {error.message}
            {error.details?.length > 0 && (
              <ul className="alert__list">
                {error.details.map((detail) => (
                  <li key={`${detail.field}-${detail.issue}`}>
                    {detail.field}: {detail.issue}
                  </li>
                ))}
              </ul>
            )}
          </Alert>
        )}

        <Field label="What kind of incident is it?" htmlFor="type">
          <Select
            id="type"
            name="type"
            value={form.type}
            onChange={set('type')}
            options={TYPE_OPTIONS}
            placeholder="Choose one…"
            required
          />
        </Field>

        {form.type && <p className="field__hint">{INCIDENT_TYPE_HINTS[form.type]}</p>}

        <Field label="Short title" htmlFor="title" hint="A line an administrator can scan in a list.">
          <input
            id="title"
            name="title"
            type="text"
            className="field__input"
            value={form.title}
            onChange={set('title')}
            maxLength={140}
            placeholder="e.g. Odd invoice email asking to change bank details"
            required
          />
        </Field>

        <Field
          label="What happened?"
          htmlFor="description"
          hint="Include anything you noticed — names, times, what you clicked, what you did next."
        >
          <Textarea
            id="description"
            name="description"
            value={form.description}
            onChange={set('description')}
            maxLength={4000}
            required
          />
        </Field>

        <Field label="When did it happen?" htmlFor="occurredAt" optional>
          <input
            id="occurredAt"
            name="occurredAt"
            type="datetime-local"
            className="field__input"
            value={form.occurredAt}
            onChange={set('occurredAt')}
            // A future date is refused by the server; blocking it here saves a
            // round trip.
            max={new Date().toISOString().slice(0, 16)}
          />
        </Field>

        <Field
          label="Attach evidence"
          htmlFor="attachment"
          optional
          hint="A screenshot or the saved email. Images, PDF, .eml or .txt, up to 10 MB."
          error={tooLarge ? 'That file is over the 10 MB limit.' : undefined}
        >
          <FileInput
            id="attachment"
            name="attachment"
            file={form.attachment}
            onChange={(file) => setForm((prev) => ({ ...prev, attachment: file }))}
            accept={ATTACHMENT_ACCEPT}
            maxBytes={ATTACHMENT_MAX_BYTES}
            disabled={submitting}
          />
        </Field>

        <Button type="submit" block disabled={!canSubmit} busy={submitting} busyLabel="Sending…">
          Submit report
        </Button>
      </form>
    </div>
  );
};

export default ReportIncident;
