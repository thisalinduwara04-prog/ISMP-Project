import { useCallback, useEffect, useRef, useState } from 'react';
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

const ALL_ROLE_VALUES = Object.values(ROLES);
const ALL_DEPARTMENT_VALUES = Object.keys(DEPARTMENT_LABELS);

// Mirrors MAX_ATTACHMENTS in the attachment service. The server is the
// authority; this only stops the button offering an upload it would refuse.
const MAX_ATTACHMENTS = 5;

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

  // Shared by the toolbar button and the attachment panel, so there is one
  // file input and one upload path rather than two that could drift.
  const fileInputRef = useRef(null);

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

  // One control that both selects everything and clears it, because those are
  // the two things an admin actually wants and a separate "clear" button would
  // sit there greyed out most of the time.
  const setAll = (field, values) =>
    setDraft((current) => ({
      ...current,
      [field]: current[field].length === values.length ? [] : [...values],
    }));

  const nextVersionNumber = isNew
    ? (policy?.versions?.[0]?.versionNumber || 0) + 1
    : existing?.versionNumber;
  const isDraft = isNew || existing?.status === 'DRAFT';

  const attachedFiles = existing?.attachments || [];
  const hasContent = draft.body.trim().length > 0 || attachedFiles.length > 0;

  // At component scope because two paths need it: Save draft, and attaching a
  // PDF to a version that has not been created yet.
  const buildPayload = () => ({
    title: draft.title.trim(),
    body: draft.body,
    targetRoles: draft.targetRoles,
    targetDepartments: draft.targetDepartments,
    dueInDays: Number(draft.dueInDays),
  });

  const save = async () => {
    setBusy(true);
    setError(null);

    try {
      const saved = isNew
        ? (await createVersion(policyId, buildPayload())).version
        : (await updateVersion(policyId, versionId, buildPayload())).version;

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
      // An attachment belongs to a version, so an unsaved draft has nothing to
      // attach it TO. Rather than disabling the button - which left a control
      // that did nothing and, being disabled, could not even show a tooltip
      // saying why - the draft is created here and the file goes onto it.
      let targetVersionId = versionId;

      if (isNew) {
        const created = await createVersion(policyId, buildPayload());
        targetVersionId = created.version.id;
      }

      await uploadAttachment(policyId, targetVersionId, file);

      if (isNew) {
        // The page changes here, so it still says what happened. On an
        // existing draft it does not: the file appears in the list below,
        // which is the confirmation.
        navigate(`/policies/${policyId}/versions/${targetVersionId}/edit`, {
          replace: true,
          state: { notice: 'Draft saved.' },
        });
        return;
      }

      await load();
    } catch (uploadError) {
      setError(uploadError);
    } finally {
      setBusy(false);
      // Allows re-selecting the same file after a rejection.
      event.target.value = '';
    }
  };

  const removeAttachment = async (attachmentId) => {
    setBusy(true);
    try {
      await deleteAttachment(policyId, versionId, attachmentId);
      await load();
    } catch (removeError) {
      setError(removeError);
    } finally {
      setBusy(false);
    }
  };

  // Bytes are shown to the admin because the 10 MB cap is per file, and
  // "why was that rejected" is easier to answer with the size on screen.
  const formatBytes = (bytes) =>
    bytes >= 1024 * 1024
      ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
      : `${Math.max(1, Math.round(bytes / 1024))} KB`;

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

  // Drives the Select all / Clear label on each group.
  const allRoles = draft.targetRoles.length === ALL_ROLE_VALUES.length;
  const allDepartments = draft.targetDepartments.length === ALL_DEPARTMENT_VALUES.length;

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
              // The PDF belongs to the version, not to a position in the text,
              // so the toolbar button opens the same file picker as the
              // attachment panel below rather than inserting anything.
              onAttach={() => fileInputRef.current?.click()}
              attachLabel="Upload a PDF"
              attachDisabled={attachedFiles.length >= MAX_ATTACHMENTS}
            />
          )}
          <small className="field__help">
            Select text and use the buttons, or type directly. Preview shows it exactly as staff
            will see it.
          </small>
        </div>

        {/* Directly below the text, because the two together are the document:
            the wording staff read on screen and the PDFs it comes from. The
            toolbar's clip opens this same picker. */}
        <div className="field attachment">
          <span className="field__label">Upload PDF</span>

          {attachedFiles.length > 0 ? (
            <ul className="attachment__list">
              {attachedFiles.map((file) => (
                <li key={file.id} className="attachment__item">
                  <a href={file.url} target="_blank" rel="noreferrer">
                    {file.name}
                  </a>
                  <span className="attachment__size">{formatBytes(file.sizeBytes)}</span>
                  {isDraft && (
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      disabled={busy}
                      onClick={() => removeAttachment(file.id)}
                    >
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted attachment__current">No file attached.</p>
          )}

          {isDraft && (
            <>
              <div className="attachment__actions">
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  disabled={busy || attachedFiles.length >= MAX_ATTACHMENTS}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {attachedFiles.length > 0 ? 'Add another PDF…' : 'Choose a PDF…'}
                </button>
              </div>

              <small className="field__help">
                PDF only, up to 10 MB each, {MAX_ATTACHMENTS} files at most. Checked by contents,
                not by name — a renamed file is rejected. Files can only be changed while this
                version is a draft, because staff acknowledge the exact documents they were shown.
              </small>
            </>
          )}
        </div>
      </section>

      <section className="card">
        <h2>Who is this for?</h2>
        <p className="muted">
          Leave both empty for everyone. Otherwise a person must match{' '}
          <strong>a selected role and a selected department</strong>.
        </p>

        <fieldset className="fieldset" disabled={!isDraft}>
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

      {/* One file input for the whole screen, rendered whenever the version is
          editable - including before it is saved, so the toolbar's attach
          button always has something to open. Hidden because both the toolbar
          button and the panel below trigger it. */}
      {isDraft && (
        <input
          ref={fileInputRef}
          type="file"
          // Both forms: on Windows the MIME type alone can leave the file
          // dialog showing nothing selectable, because it depends on a
          // registry association that may be missing. The extension is what
          // reliably filters.
          accept=".pdf,application/pdf"
          className="visually-hidden"
          tabIndex={-1}
          aria-hidden="true"
          onChange={attach}
        />
      )}

      {isDraft && (
        <section className="card">
          <div className="confirm-actions">
            <button type="button" className="btn btn--ghost" disabled={busy} onClick={save}>
              {busy ? 'Saving…' : 'Save draft'}
            </button>

            {!isNew && (
              <button
                type="button"
                className="btn btn--primary"
                disabled={!hasContent || busy}
                onClick={() => setConfirmingPublish(true)}
              >
                Publish…
              </button>
            )}
          </div>

          {isNew && <p className="muted">Save the draft before you can publish it.</p>}

          {!isNew && !hasContent && (
            <p className="muted">
              This version has nothing to read yet. Write the policy text, attach the signed PDF, or
              both, before publishing.
            </p>
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
