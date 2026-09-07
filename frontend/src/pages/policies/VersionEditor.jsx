import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import Alert from '../../components/Alert';
import Spinner from '../../components/Spinner';
import MarkdownText from '../../components/MarkdownText';
import RichTextArea from '../../components/RichTextArea';
import {
  fetchPolicy,
  fetchVersion,
  createVersion,
  updateVersion,
  publishVersion,
  uploadAttachment,
  deleteAttachment,
} from '../../api/policies';
import { ROLES, ROLE_LABELS, DEPARTMENT_LABELS } from '../../constants';

// Steps 2 and 3: write the wording, choose who it is for, attach the signed
// PDF, then publish.
//
// The screen is only ever an editor for a DRAFT. A published version is
// immutable - the API returns 409 on any attempt to change one - so rather
// than presenting fields that would be rejected, this loads in read-only mode
// and points the admin at creating a new version instead.

const emptyDraft = {
  title: '',
  body: '',
  changeNote: '',
  targetRoles: [],
  targetDepartments: [],
  dueInDays: 14,
};

const VersionEditor = () => {
  const { policyId, versionId } = useParams();
  const navigate = useNavigate();
  const isNew = !versionId || versionId === 'new';

  const [policy, setPolicy] = useState(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [existing, setExisting] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const [confirmingPublish, setConfirmingPublish] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const policyData = await fetchPolicy(policyId);
      setPolicy(policyData.policy);

      if (isNew) {
        // Version 2 onward carries the audience of the version it replaces, so
        // the common case - same people, new wording - needs no re-picking.
        const current = policyData.policy.versions?.find((v) => v.status === 'PUBLISHED');
        setDraft({
          ...emptyDraft,
          title: policyData.policy.title,
          targetRoles: current?.targetRoles || [],
          targetDepartments: current?.targetDepartments || [],
        });
        return;
      }

      const versionData = await fetchVersion(policyId, versionId);
      setExisting(versionData.version);
      setDraft({
        title: versionData.version.title,
        body: versionData.version.body,
        changeNote: versionData.version.changeNote || '',
        targetRoles: versionData.version.targetRoles || [],
        targetDepartments: versionData.version.targetDepartments || [],
        dueInDays: versionData.version.dueInDays,
      });
    } catch (loadError) {
      setError(loadError);
    }
  }, [policyId, versionId, isNew]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = (field, value) =>
    setDraft((current) => ({
      ...current,
      [field]: current[field].includes(value)
        ? current[field].filter((item) => item !== value)
        : [...current[field], value],
    }));

  const nextVersionNumber = isNew
    ? (policy?.versions?.[0]?.versionNumber || 0) + 1
    : existing?.versionNumber;
  const changeNoteRequired = nextVersionNumber >= 2;
  const isDraft = isNew || existing?.status === 'DRAFT';

  const canSave =
    draft.body.trim().length > 0 && (!changeNoteRequired || draft.changeNote.trim().length > 0);

  const save = async () => {
    setBusy(true);
    setError(null);

    const payload = {
      title: draft.title.trim(),
      body: draft.body,
      targetRoles: draft.targetRoles,
      targetDepartments: draft.targetDepartments,
      dueInDays: Number(draft.dueInDays),
      ...(draft.changeNote.trim() ? { changeNote: draft.changeNote.trim() } : {}),
    };

    try {
      const saved = isNew
        ? (await createVersion(policyId, payload)).version
        : (await updateVersion(policyId, versionId, payload)).version;

      // Back to the policy, where the draft now appears in the version history
      // with "Continue draft" and "Discard draft" beside it. The notice is
      // carried through the navigation because this screen is about to unmount.
      navigate(`/policies/${policyId}`, {
        replace: true,
        state: {
          notice: `Draft version ${saved.versionNumber} saved. Nobody has been assigned it — it stays invisible to staff until you publish it.`,
        },
      });
    } catch (saveError) {
      setError(saveError);
      setBusy(false);
    }
  };

  const publish = async () => {
    setBusy(true);
    setError(null);

    try {
      const data = await publishVersion(policyId, versionId);

      // Carried through the navigation rather than shown here, because this
      // screen is about to unmount. The detail page reads it and reports how
      // many people were actually assigned.
      navigate(`/policies/${policyId}`, {
        replace: true,
        state: {
          notice: `Published version ${data.version.versionNumber}. ${data.publication.assignedCount} member${
            data.publication.assignedCount === 1 ? '' : 's'
          } of staff ${data.publication.assignedCount === 1 ? 'has' : 'have'} been assigned it${
            data.publication.supersededVersionNumber
              ? `, and version ${data.publication.supersededVersionNumber} was superseded`
              : ''
          }.`,
        },
      });
    } catch (publishError) {
      setError(publishError);
      setConfirmingPublish(false);
    } finally {
      setBusy(false);
    }
  };

  const attach = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setBusy(true);
    setError(null);

    try {
      await uploadAttachment(policyId, versionId, file);
      setNotice('PDF attached.');
      await load();
    } catch (uploadError) {
      setError(uploadError);
    } finally {
      setBusy(false);
      // Allows re-selecting the same file after a rejection.
      event.target.value = '';
    }
  };

  const removeAttachment = async () => {
    setBusy(true);
    try {
      await deleteAttachment(policyId, versionId);
      await load();
    } catch (removeError) {
      setError(removeError);
    } finally {
      setBusy(false);
    }
  };

  if (error && !policy) {
    return (
      <div className="page">
        <header className="page__header">
          <h1>Policy version</h1>
        </header>
        <Alert tone="error" title="Could not open this version">
          {error.message}
        </Alert>
      </div>
    );
  }

  // BOTH must be loaded before rendering. `setPolicy` and `setExisting` happen
  // in separate microtasks either side of an await, so React commits a render
  // between them - and the header below reads existing.versionNumber. Guarding
  // only on `policy` left that render dereferencing null and blanking the page,
  // which is what made "Continue draft" look like a dead button.
  if (!policy || (!isNew && !existing)) return <Spinner label="Loading…" />;

  const everyone = draft.targetRoles.length === 0 && draft.targetDepartments.length === 0;

  return (
    <div className="page page--narrow">
      <header className="page__header">
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => navigate(`/policies/${policyId}`)}
        >
          ← {policy.title}
        </button>
        <h1>{isNew ? `Write version ${nextVersionNumber}` : `Version ${existing.versionNumber}`}</h1>
        <p>
          {policy.code}
          {isDraft ? ' · Draft — not visible to staff' : ` · ${existing.status.toLowerCase()}`}
        </p>
      </header>

      {notice && <Alert tone="info">{notice}</Alert>}

      {error && (
        <Alert title="That did not work">
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

      {!isDraft && (
        <Alert tone="warning" title="This version is published and cannot be edited">
          People have been asked to acknowledge this exact wording, so it is fixed. To correct it,
          create a new version — staff will be asked to read and confirm the new one.
        </Alert>
      )}

      <section className="card">
        <label className="field" htmlFor="v-title">
          <span className="field__label">Title</span>
          <input
            id="v-title"
            className="field__input"
            value={draft.title}
            disabled={!isDraft}
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
          />
        </label>

        <div className="field">
          <div className="field__row">
            <span className="field__label" id="body-label">
              Policy text
            </span>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setPreview(!preview)}
            >
              {preview ? 'Edit' : 'Preview'}
            </button>
          </div>

          {preview ? (
            <div className="editor-preview">
              <MarkdownText>{draft.body}</MarkdownText>
            </div>
          ) : (
            <RichTextArea
              id="v-body"
              value={draft.body}
              disabled={!isDraft}
              onChange={(body) => setDraft({ ...draft, body })}
              placeholder={'## Purpose\n\nWhy this policy exists.\n\n## The rule\n\n- What people must do.'}
            />
          )}
          <small className="field__help">
            Select text and use the buttons, or type directly. Preview shows it exactly as staff
            will see it.
          </small>
        </div>

        <label className="field" htmlFor="v-note">
          <span className="field__label">
            What changed{changeNoteRequired ? '' : ' (optional for version 1)'}
          </span>
          <input
            id="v-note"
            className="field__input"
            value={draft.changeNote}
            disabled={!isDraft}
            onChange={(event) => setDraft({ ...draft, changeNote: event.target.value })}
            placeholder="Added USB storage restriction."
          />
          {changeNoteRequired && (
            <small className="field__help">
              Required from version 2 — staff being asked to re-acknowledge need to know why.
            </small>
          )}
        </label>
      </section>

      <section className="card">
        <h2>Who is this for?</h2>
        <p className="muted">
          Leave both empty for everyone. Otherwise a person must match{' '}
          <strong>a selected role and a selected department</strong>.
        </p>

        <fieldset className="fieldset" disabled={!isDraft}>
          <legend className="field__label">Roles</legend>
          <div className="choice-row">
            {Object.values(ROLES).map((role) => (
              <label key={role} className="choice" htmlFor={`role-${role}`}>
                <input
                  id={`role-${role}`}
                  type="checkbox"
                  checked={draft.targetRoles.includes(role)}
                  onChange={() => toggle('targetRoles', role)}
                />
                <span>{ROLE_LABELS[role]}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="fieldset" disabled={!isDraft}>
          <legend className="field__label">Departments</legend>
          <div className="choice-row">
            {Object.entries(DEPARTMENT_LABELS).map(([value, label]) => (
              <label key={value} className="choice" htmlFor={`dept-${value}`}>
                <input
                  id={`dept-${value}`}
                  type="checkbox"
                  checked={draft.targetDepartments.includes(value)}
                  onChange={() => toggle('targetDepartments', value)}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <p className={everyone ? 'audience-summary audience-summary--all' : 'audience-summary'}>
          {everyone
            ? 'Everyone in the business will be assigned this.'
            : `Assigned to ${draft.targetRoles.length ? draft.targetRoles.map((r) => ROLE_LABELS[r]).join(' or ') : 'any role'} in ${
                draft.targetDepartments.length
                  ? draft.targetDepartments.map((d) => DEPARTMENT_LABELS[d]).join(' or ')
                  : 'any department'
              }.`}
        </p>

        <label className="field" htmlFor="v-due">
          <span className="field__label">Days to read it</span>
          <input
            id="v-due"
            type="number"
            min="1"
            max="365"
            className="field__input field__input--short"
            value={draft.dueInDays}
            disabled={!isDraft}
            onChange={(event) => setDraft({ ...draft, dueInDays: event.target.value })}
          />
        </label>
      </section>

      {!isNew && (
        <section className="card">
          <h2>Signed PDF (optional)</h2>
          {existing?.attachmentName ? (
            <p>
              <a href={existing.attachmentUrl} target="_blank" rel="noreferrer">
                {existing.attachmentName}
              </a>
              {isDraft && (
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  disabled={busy}
                  onClick={removeAttachment}
                >
                  Remove
                </button>
              )}
            </p>
          ) : (
            <p className="muted">No file attached.</p>
          )}

          {isDraft && (
            <label className="field" htmlFor="v-file">
              <span className="field__label">Attach a PDF</span>
              <input id="v-file" type="file" accept="application/pdf" disabled={busy} onChange={attach} />
              <small className="field__help">
                PDF only, up to 10 MB. The file is checked by its contents, not its name — a
                renamed file will be rejected. It can only be attached while this version is a draft.
              </small>
            </label>
          )}
        </section>
      )}

      {isDraft && (
        <section className="card">
          <div className="confirm-actions">
            <button type="button" className="btn btn--ghost" disabled={!canSave || busy} onClick={save}>
              {busy ? 'Saving…' : 'Save draft'}
            </button>

            {!isNew && (
              <button
                type="button"
                className="btn btn--primary"
                disabled={!canSave || busy}
                onClick={() => setConfirmingPublish(true)}
              >
                Publish…
              </button>
            )}
          </div>

          {isNew && (
            <p className="muted">Save the draft before you can publish it.</p>
          )}

          {confirmingPublish && (
            <Alert tone="warning" title="Publish this version?">
              <ul className="alert__list">
                <li>Every targeted member of staff is assigned it and asked to acknowledge it.</li>
                <li>Any previous version is superseded, and its outstanding tasks are closed.</li>
                <li>
                  Acknowledgements already recorded against the old version are kept as evidence.
                </li>
                <li>
                  The wording becomes <strong>permanent</strong> — corrections need a new version.
                </li>
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
        </section>
      )}
    </div>
  );
};

export default VersionEditor;
