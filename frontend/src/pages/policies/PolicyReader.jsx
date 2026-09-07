import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import Alert from '../../components/Alert';
import Spinner from '../../components/Spinner';
import MarkdownText from '../../components/MarkdownText';
import { fetchVersion, acknowledgeVersion, fetchPolicy } from '../../api/policies';
import { formatDate, formatDateTime, formatDuration } from '../../utils/format';

// UC-10 / US-014. Reading a policy and confirming it.
//
// The gate on the confirm control is the interesting part. It is a usability
// measure against reflexive clicking, NOT a security control - the API would
// happily accept an acknowledgement one second after the version was opened.
// What makes the record meaningful is that the server derives the reading time
// from its own POLICY_VIEWED event, so a fast confirmation is visible as a
// fast confirmation in the audit trail rather than being prevented here.

const MINIMUM_SECONDS = 15;

const PolicyReader = () => {
  const { policyId, versionId } = useParams();
  const navigate = useNavigate();

  const [version, setVersion] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [notice, setNotice] = useState(null);

  const [scrolledToEnd, setScrolledToEnd] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(MINIMUM_SECONDS);
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [receipt, setReceipt] = useState(null);

  const endRef = useRef(null);

  // --- Load -----------------------------------------------------------------

  const load = useCallback(async () => {
    setLoadError(null);
    setVersion(null);
    setScrolledToEnd(false);
    setSecondsLeft(MINIMUM_SECONDS);
    setConfirmed(false);
    setReceipt(null);

    try {
      const data = await fetchVersion(policyId, versionId);
      setVersion(data.version);
    } catch (error) {
      setLoadError(error);
    }
  }, [policyId, versionId]);

  useEffect(() => {
    load();
  }, [load]);

  // --- Gate condition 1: fifteen seconds ------------------------------------
  //
  // Counts down from when the document is on screen, not from the route
  // change, so a slow connection does not eat the reading time.
  useEffect(() => {
    if (!version || receipt) return undefined;

    const timer = setInterval(() => {
      setSecondsLeft((current) => (current <= 1 ? 0 : current - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [version, receipt]);

  // --- Gate condition 2: scrolled to the end --------------------------------
  //
  // An IntersectionObserver on a sentinel after the last paragraph, rather
  // than arithmetic on scrollTop. It is correct whether the page scrolls or an
  // inner container does, and on a short policy that needs no scrolling at all
  // the sentinel is visible immediately - which is the right answer, not a
  // trap that can never be satisfied.
  useEffect(() => {
    const sentinel = endRef.current;
    if (!sentinel || receipt) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setScrolledToEnd(true);
      },
      { threshold: 0.6 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [version, receipt]);

  // --- Submit ---------------------------------------------------------------

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setSubmitError(null);

    try {
      const data = await acknowledgeVersion(policyId, versionId);
      setReceipt(data.acknowledgement);
    } catch (error) {
      // 409: a newer version was published while this page was open. The old
      // wording is no longer what anyone is being asked to agree to, so the
      // reader is moved to the new one rather than being allowed to retry.
      if (error.status === 409) {
        try {
          const policy = await fetchPolicy(policyId);
          setNotice(
            'This policy was updated while you had it open. You are now reading the new version — please read it and confirm again.'
          );
          navigate(`/policies/${policyId}/versions/${policy.policy.currentVersion.id}`, {
            replace: true,
          });
        } catch {
          setSubmitError('This policy has been updated. Please return to the list and open it again.');
        }
      } else if (error.status === 410) {
        // Withdrawn mid-read. There is nothing left to acknowledge.
        setNotice('This policy has been withdrawn and no longer needs to be acknowledged.');
        navigate('/policies', { replace: true });
      } else {
        setSubmitError(error.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  // --- Render ---------------------------------------------------------------

  if (loadError) {
    const forbidden = loadError.status === 403;

    return (
      <div className="page">
        <header className="page__header">
          <h1>Policy</h1>
        </header>
        <Alert tone="error" title={forbidden ? 'Not available to you' : 'Could not open this policy'}>
          {forbidden
            ? 'This policy is aimed at a different role or department, so it has not been assigned to you.'
            : loadError.message}
        </Alert>
        <button type="button" className="btn btn--ghost" onClick={() => navigate('/policies')}>
          Back to policies
        </button>
      </div>
    );
  }

  if (!version) return <Spinner label="Opening the policy…" />;

  const waiting = secondsLeft > 0;
  const gateOpen = scrolledToEnd && !waiting;

  // Never a dead control: the reason it cannot be used yet is always stated,
  // and it changes as each condition is met (NFR-USE-03).
  const gateReason = !scrolledToEnd
    ? 'Please read to the end of the document.'
    : `Available in ${secondsLeft} second${secondsLeft === 1 ? '' : 's'}.`;

  return (
    <div className="page page--reader">
      {notice && (
        <Alert tone="info" title="This policy changed">
          {notice}
        </Alert>
      )}

      <header className="page__header">
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => navigate('/policies')}>
          ← All policies
        </button>
        <h1>{version.title}</h1>
        <p>
          Version {version.versionNumber} · Effective {formatDate(version.effectiveFrom)}
        </p>
      </header>

      {version.changeNote && (
        <Alert tone="info" title={`What changed in version ${version.versionNumber}`}>
          {version.changeNote}
        </Alert>
      )}

      <article className="card reader">
        <MarkdownText>{version.body}</MarkdownText>

        {version.attachmentUrl && (
          <p className="reader__attachment">
            <a href={version.attachmentUrl} target="_blank" rel="noreferrer">
              Download the signed PDF{version.attachmentName ? ` (${version.attachmentName})` : ''}
            </a>
          </p>
        )}

        {/* The sentinel the observer above watches. */}
        <div ref={endRef} className="reader__end" aria-hidden="true" />
      </article>

      {receipt ? (
        <Alert tone="success" title="Acknowledgement recorded">
          You confirmed version {receipt.versionNumber} on {formatDateTime(receipt.acknowledgedAt)}.
          {receipt.timeSpentSeconds !== null && receipt.timeSpentSeconds !== undefined
            ? ` Time spent reading: ${formatDuration(receipt.timeSpentSeconds)}.`
            : ''}
          <p>
            <button type="button" className="btn btn--primary" onClick={() => navigate('/policies')}>
              Back to my policies
            </button>
          </p>
        </Alert>
      ) : (
        <form className="card acknowledge" onSubmit={submit}>
          <h2>Confirm you have read this policy</h2>

          {submitError && <Alert tone="error">{submitError}</Alert>}

          <label className="checkbox" htmlFor="confirm">
            <input
              id="confirm"
              type="checkbox"
              checked={confirmed}
              disabled={!gateOpen || submitting}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            <span>I have read and understood this policy</span>
          </label>

          {!gateOpen && (
            <p className="acknowledge__reason" role="status" aria-live="polite">
              {gateReason}
            </p>
          )}

          <button
            type="submit"
            className="btn btn--primary btn--block"
            disabled={!gateOpen || !confirmed || submitting}
          >
            {submitting ? 'Recording…' : 'Confirm and record'}
          </button>

          <p className="muted acknowledge__footnote">
            The date, time and duration are recorded by the server as evidence that you read this
            exact version.
          </p>
        </form>
      )}
    </div>
  );
};

export default PolicyReader;
