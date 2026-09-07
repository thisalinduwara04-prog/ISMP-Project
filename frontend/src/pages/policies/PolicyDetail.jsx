import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';

import Alert from '../../components/Alert';
import Spinner from '../../components/Spinner';
import AcknowledgementTrail from './AcknowledgementTrail';
import {
  fetchPolicy,
  setPolicyStatus,
  updatePolicy,
  deleteVersion,
  publishVersion,
  deletePolicy,
} from '../../api/policies';
import { formatDate } from '../../utils/format';
import { POLICY_CATEGORY_LABELS } from '../../constants';

// The admin view of one policy: its revision history, the evidence trail for a
// chosen version, and the archive control.
//
// Employees never reach this screen - they go straight to the reader - but
// that is routing, not security. Every endpoint it calls refuses a
// non-admin token on its own.

const STATUS_NOTE = {
  DRAFT: 'Not yet published. Only administrators can see it.',
  PUBLISHED: 'In force. This is the version staff are asked to acknowledge.',
  SUPERSEDED: 'Replaced by a newer version. Its acknowledgements are retained as evidence.',
  ARCHIVED: 'Withdrawn. Retained for the record.',
};

const PolicyDetail = () => {
  const { policyId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [policy, setPolicy] = useState(null);
  const [error, setError] = useState(null);
  const [selectedVersionId, setSelectedVersionId] = useState(null);
  const [confirmingArchive, setConfirmingArchive] = useState(false);
  const [confirmingPublish, setConfirmingPublish] = useState(false);
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);
  const [evidenceWarning, setEvidenceWarning] = useState(null);
  const [versionToDelete, setVersionToDelete] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ title: '', category: 'GENERAL', description: '' });
  const [working, setWorking] = useState(false);
  // Seeded from the publish redirect, if the admin has just arrived from one.
  const [notice, setNotice] = useState(location.state?.notice || null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchPolicy(policyId);
      setPolicy(data.policy);
      setEditForm({
        title: data.policy.title,
        category: data.policy.category,
        description: data.policy.description || '',
      });
      setSelectedVersionId((current) => current || (data.policy.currentVersion || {}).id || null);
    } catch (loadError) {
      setError(loadError.message);
    }
  }, [policyId]);

  useEffect(() => {
    load();
  }, [load]);

  // Editing the SHELL only - title, category, description, all of which
  // describe the policy rather than state any rule. The wording people
  // acknowledge lives on the version and is immutable once published.
  const saveDetails = async (event) => {
    event.preventDefault();
    setWorking(true);
    setError(null);

    try {
      await updatePolicy(policyId, {
        title: editForm.title.trim(),
        category: editForm.category,
        description: editForm.description.trim(),
      });
      setEditing(false);
      setNotice('Details updated.');
      await load();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setWorking(false);
    }
  };

  const publishDraft = async (versionId) => {
    setWorking(true);
    setError(null);

    try {
      const data = await publishVersion(policyId, versionId);
      setConfirmingPublish(false);
      setNotice(
        `Published version ${data.version.versionNumber}. ${data.publication.assignedCount} member${
          data.publication.assignedCount === 1 ? '' : 's'
        } of staff assigned${
          data.publication.supersededVersionNumber
            ? `, version ${data.publication.supersededVersionNumber} superseded`
            : ''
        }.`
      );
      setSelectedVersionId(versionId);
      await load();
    } catch (publishError) {
      setError(publishError.message);
      setConfirmingPublish(false);
    } finally {
      setWorking(false);
    }
  };

  const removePolicy = async (confirmEvidenceLoss) => {
    setWorking(true);
    setError(null);

    try {
      await deletePolicy(policyId, confirmEvidenceLoss);
      navigate('/policies', {
        replace: true,
        state: { notice: `${policy.code} was permanently deleted.` },
      });
    } catch (deleteError) {
      setError(deleteError.message);
      // The API refuses the first attempt whenever acknowledgements would be
      // destroyed, and says how many. That refusal is what the second, explicit
      // confirmation below is for.
      setEvidenceWarning(deleteError.status === 409 ? deleteError.message : null);
      setWorking(false);
    }
  };

  const removeVersion = async (versionId, confirmEvidenceLoss) => {
    setWorking(true);
    setError(null);

    try {
      const result = await deleteVersion(policyId, versionId, confirmEvidenceLoss);
      setVersionToDelete(null);
      setEvidenceWarning(null);
      setSelectedVersionId(null);
      setNotice(
        `Version ${result.versionNumber} deleted.${
          result.acknowledgementsDestroyed
            ? ` ${result.acknowledgementsDestroyed} acknowledgement(s) were destroyed.`
            : ''
        }${
          result.policyHasNoCurrentVersion
            ? ' This policy now has no version in force — publish one to reassign it.'
            : ''
        }`
      );
      await load();
    } catch (deleteError) {
      setError(deleteError.message);
      // The API refuses the first attempt whenever evidence would be lost, and
      // says how much. That refusal is what the second confirmation is for.
      setEvidenceWarning(deleteError.status === 409 ? deleteError.message : null);
      setWorking(false);
      return;
    }

    setWorking(false);
  };


  const changeStatus = async (status) => {
    setWorking(true);
    setNotice(null);
    try {
      const data = await setPolicyStatus(policyId, status);
      setConfirmingArchive(false);
      setNotice(
        status === 'ARCHIVED'
          ? `Archived. ${data.policy.archive?.closedAssignments ?? 0} outstanding task(s) were closed; every acknowledgement was kept.`
          : 'Restored. Publish a new version to put it back on staff task lists.'
      );
      await load();
    } catch (statusError) {
      setError(statusError.message);
    } finally {
      setWorking(false);
    }
  };

  if (error && !policy) {
    return (
      <div className="page">
        <header className="page__header">
          <h1>Policy</h1>
        </header>
        <Alert tone="error" title="Could not load this policy">
          {error}
        </Alert>
      </div>
    );
  }

  if (!policy) return <Spinner label="Loading policy…" />;

  const archived = policy.status === 'ARCHIVED';
  const existingDraft = policy.versions.find((version) => version.status === 'DRAFT');

  return (
    <div className="page">
      <header className="page__header">
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => navigate('/policies')}>
          ← All policies
        </button>
        <h1>{policy.title}</h1>
        <p>
          {policy.code} · {policy.category.replaceAll('_', ' ').toLowerCase()}
          {archived && ' · archived'}
        </p>
      </header>

      {notice && <Alert tone="info">{notice}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}

      <section className="card">
        <div className="field__row">
          <h2>Details</h2>
          {!editing && (
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing(true)}>
              Edit
            </button>
          )}
        </div>

        {editing ? (
          <form onSubmit={saveDetails} noValidate>
            <label className="field" htmlFor="edit-title">
              <span className="field__label">Title</span>
              <input
                id="edit-title"
                className="field__input"
                value={editForm.title}
                onChange={(event) => setEditForm({ ...editForm, title: event.target.value })}
                required
              />
            </label>

            <label className="field" htmlFor="edit-category">
              <span className="field__label">Category</span>
              <select
                id="edit-category"
                className="field__input"
                value={editForm.category}
                onChange={(event) => setEditForm({ ...editForm, category: event.target.value })}
              >
                {Object.entries(POLICY_CATEGORY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field" htmlFor="edit-description">
              <span className="field__label">Short description</span>
              <input
                id="edit-description"
                className="field__input"
                value={editForm.description}
                onChange={(event) => setEditForm({ ...editForm, description: event.target.value })}
              />
            </label>

            <p className="field__help">
              The code cannot be changed — acknowledgement records and reports refer to it, so it
              is fixed for the life of the policy. The wording staff acknowledge lives on each
              version, not here.
            </p>

            <div className="confirm-actions">
              <button type="submit" className="btn btn--primary btn--sm" disabled={working}>
                {working ? 'Saving…' : 'Save details'}
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                disabled={working}
                onClick={() => setEditing(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <dl className="detail-list">
            <div>
              <dt>Code</dt>
              <dd>{policy.code}</dd>
            </div>
            <div>
              <dt>Category</dt>
              <dd>{POLICY_CATEGORY_LABELS[policy.category] || policy.category}</dd>
            </div>
            <div>
              <dt>Description</dt>
              <dd>{policy.description || <span className="muted">None</span>}</dd>
            </div>
          </dl>
        )}
      </section>

      <section className="card">
        <h2>Version history</h2>
        <p className="muted">
          Every revision is kept. Select one to see who acknowledged that exact wording. A draft
          can be edited freely; once published, its text is fixed and a correction means a new
          version.
        </p>

        <ul className="version-list">
          {policy.versions.map((version) => (
            <li
              key={version.id}
              className={`version-row${version.id === selectedVersionId ? ' version-row--selected' : ''}`}
            >
              {/* Selecting drives the acknowledgement trail below; the action
                  on the right opens the version itself. Two separate controls
                  rather than one row that has to guess which was meant. */}
              <button
                type="button"
                className="version-row__select"
                onClick={() => setSelectedVersionId(version.id)}
                aria-pressed={version.id === selectedVersionId}
              >
                <span className="version-row__title">
                  Version {version.versionNumber}
                  {version.changeNote ? ` — ${version.changeNote}` : ''}
                </span>
                <span className="version-row__meta">
                  {version.publishedAt
                    ? `Published ${formatDate(version.publishedAt)}`
                    : `Created ${formatDate(version.createdAt)}`}
                  {' · '}
                  {STATUS_NOTE[version.status]}
                </span>
              </button>

              <div className="version-row__actions">
                <span className={`badge badge--${version.status === 'PUBLISHED' ? 'ok' : 'neutral'}`}>
                  {version.status.toLowerCase()}
                </span>

                {version.status === 'DRAFT' ? (
                  <Link
                    to={`/policies/${policy.id}/versions/${version.id}/edit`}
                    className="btn btn--ghost btn--sm"
                  >
                    Edit
                  </Link>
                ) : (
                  <Link
                    to={`/policies/${policy.id}/versions/${version.id}`}
                    className="btn btn--ghost btn--sm"
                  >
                    Read
                  </Link>
                )}

                <button
                  type="button"
                  className="btn btn--danger btn--sm"
                  disabled={working}
                  title={`Delete version ${version.versionNumber}`}
                  onClick={() => {
                    setEvidenceWarning(null);
                    setVersionToDelete(version);
                  }}
                >
                  Delete
                </button>
              </div>

              {versionToDelete?.id === version.id && (
                <Alert
                  tone={version.status === 'DRAFT' ? 'warning' : 'error'}
                  title={`Delete version ${version.versionNumber}?`}
                >
                  {version.status === 'DRAFT' ? (
                    'It was never published, so nobody was assigned it and nobody acknowledged it — deleting it destroys no evidence.'
                  ) : (
                    <ul className="alert__list">
                      <li>
                        This version <strong>was published</strong>. Any acknowledgement recorded
                        against it is destroyed with it.
                      </li>
                      <li>Its assignments are removed from the compliance ledger.</li>
                      {version.status === 'PUBLISHED' && (
                        <li>
                          It is the version currently in force — the policy will be left with none
                          until you publish a new one. The previous version is{' '}
                          <strong>not</strong> revived.
                        </li>
                      )}
                    </ul>
                  )}

                  {evidenceWarning && (
                    <p className="delete-warning">
                      <strong>Read this before continuing.</strong> {evidenceWarning}
                    </p>
                  )}

                  <p className="confirm-actions">
                    <button
                      type="button"
                      className="btn btn--danger"
                      disabled={working}
                      onClick={() => removeVersion(version.id, Boolean(evidenceWarning))}
                    >
                      {working
                        ? 'Deleting…'
                        : evidenceWarning
                          ? 'Delete anyway, destroying the evidence'
                          : 'Yes, delete it'}
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost"
                      disabled={working}
                      onClick={() => {
                        setVersionToDelete(null);
                        setEvidenceWarning(null);
                      }}
                    >
                      Cancel
                    </button>
                  </p>
                </Alert>
              )}
            </li>
          ))}
        </ul>

        <div className="confirm-actions">
          {/* Only one draft may exist at a time, so the control is either
              "continue the one you have" or "start a new one" - never both. */}
          {existingDraft ? (
            <>
              <Link
                to={`/policies/${policy.id}/versions/${existingDraft.id}/edit`}
                className="btn btn--primary btn--sm"
              >
                Continue draft (version {existingDraft.versionNumber})
              </Link>
              <button
                type="button"
                className="btn btn--primary btn--sm"
                disabled={working}
                onClick={() => setConfirmingPublish(true)}
              >
                Publish version {existingDraft.versionNumber}
              </button>
            </>
          ) : (
            !archived && (
              <Link to={`/policies/${policy.id}/versions/new`} className="btn btn--primary btn--sm">
                + New version
              </Link>
            )
          )}

          {policy.currentVersion && (
            <Link
              to={`/policies/${policy.id}/versions/${policy.currentVersion.id}`}
              className="btn btn--ghost btn--sm"
            >
              Read the current version
            </Link>
          )}
        </div>

        {confirmingPublish && existingDraft && (
          <Alert tone="warning" title={`Publish version ${existingDraft.versionNumber}?`}>
            <ul className="alert__list">
              <li>Every targeted member of staff is assigned it and asked to acknowledge it.</li>
              <li>Any previous version is superseded, and its outstanding tasks are closed.</li>
              <li>Acknowledgements already recorded against the old version are kept.</li>
              <li>
                The wording becomes <strong>permanent</strong> — corrections need a new version.
              </li>
            </ul>
            <p className="confirm-actions">
              <button
                type="button"
                className="btn btn--primary"
                disabled={working}
                onClick={() => publishDraft(existingDraft.id)}
              >
                {working ? 'Publishing…' : 'Yes, publish it'}
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                disabled={working}
                onClick={() => setConfirmingPublish(false)}
              >
                Cancel
              </button>
            </p>
          </Alert>
        )}

      </section>

      {selectedVersionId && (
        <AcknowledgementTrail policyId={policy.id} versionId={selectedVersionId} />
      )}

      <section className="card">
        <h2>{archived ? 'Restore this policy' : 'Archive this policy'}</h2>

        {!confirmingArchive ? (
          <>
            <p className="muted">
              {archived
                ? 'Restoring makes the policy visible to administrators again. It does not put it back on anyone’s task list.'
                : 'Archiving withdraws the policy from staff task lists. Nothing is deleted.'}
            </p>
            <div className="confirm-actions">
              <button
                type="button"
                className="btn btn--ghost"
                disabled={working}
                onClick={() => (archived ? changeStatus('ACTIVE') : setConfirmingArchive(true))}
              >
                {archived ? 'Restore policy' : 'Archive policy…'}
              </button>
              <button
                type="button"
                className="btn btn--danger"
                disabled={working}
                onClick={() => {
                  setEvidenceWarning(null);
                  setConfirmingRemoval(true);
                }}
              >
                Delete permanently…
              </button>
            </div>
          </>
        ) : (
          // The consequences are spelled out because one of them is
          // irreversible in practice: the closed assignments do not come back.
          <Alert tone="warning" title="Archive this policy?">
            <ul className="alert__list">
              <li>It disappears from every employee task list immediately.</li>
              <li>Outstanding tasks are closed, so they stop counting against compliance.</li>
              <li>Every acknowledgement already recorded is kept and stays queryable.</li>
              <li>
                Restoring it later will <strong>not</strong> put it back on anyone’s list — you would
                need to publish a new version to reassign it.
              </li>
            </ul>
            <p className="confirm-actions">
              <button
                type="button"
                className="btn btn--primary"
                disabled={working}
                onClick={() => changeStatus('ARCHIVED')}
              >
                {working ? 'Archiving…' : 'Yes, archive it'}
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                disabled={working}
                onClick={() => setConfirmingArchive(false)}
              >
                Cancel
              </button>
            </p>
          </Alert>
        )}

        {confirmingRemoval && (
          <Alert tone="error" title={`Permanently delete ${policy.code}?`}>
            <ul className="alert__list">
              <li>The policy, every version and every assignment are erased.</li>
              <li>
                <strong>Acknowledgements are destroyed too</strong> — the proof that named staff
                read this policy stops existing.
              </li>
              <li>Nothing can be recovered. Archiving is the reversible alternative.</li>
              <li>An audit entry recording this deletion is kept.</li>
            </ul>

            {evidenceWarning && (
              <p className="delete-warning">
                <strong>Read this before continuing.</strong> {evidenceWarning}
              </p>
            )}

            <p className="confirm-actions">
              <button
                type="button"
                className="btn btn--danger"
                disabled={working}
                onClick={() => removePolicy(Boolean(evidenceWarning))}
              >
                {working
                  ? 'Deleting…'
                  : evidenceWarning
                    ? 'Delete anyway, destroying the evidence'
                    : 'Delete this policy'}
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                disabled={working}
                onClick={() => {
                  setConfirmingRemoval(false);
                  setEvidenceWarning(null);
                }}
              >
                Cancel
              </button>
            </p>
          </Alert>
        )}
      </section>
    </div>
  );
};

export default PolicyDetail;
