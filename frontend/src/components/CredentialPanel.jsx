import { useState } from 'react';

import Alert from './Alert';

// The one place in the interface that shows a password.
//
// The server generates it, returns it once, and keeps only the bcrypt digest -
// so there is no screen, endpoint or support process that can retrieve it
// afterwards. If the admin navigates away without copying it, the only way
// forward is a reset, which issues a different one. The wording says exactly
// that, because an admin who assumes they can look it up later will not write
// it down.
const CredentialPanel = ({ user, temporaryPassword, children }) => {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(temporaryPassword);
      setCopied(true);
    } catch {
      // Clipboard access is refused in some browsers and over plain HTTP. The
      // password is on screen and selectable either way, so this is a
      // convenience failing, not an error worth interrupting the admin over.
      setCopied(false);
    }
  };

  return (
    <section className="card credential">
      <h2>{user.fullName}</h2>
      <p className="muted">
        {user.employeeId} · {user.email}
      </p>

      <div className="credential__row">
        <span className="field__label" id="temp-password-label">
          Temporary password
        </span>
        <div className="credential__value">
          {/* A read-only input rather than plain text so it can be selected and
              copied by keyboard when the clipboard API is unavailable. */}
          <input
            className="field__input credential__secret"
            value={temporaryPassword}
            readOnly
            aria-labelledby="temp-password-label"
            onFocus={(event) => event.target.select()}
          />
          <button type="button" className="btn btn--ghost btn--sm" onClick={copy}>
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      <Alert tone="warning" title="Shown once">
        Give this to {user.fullName} directly. It is not stored in readable form and cannot be
        shown again — if it is lost, reset the password to issue a new one. They will be asked to
        choose their own password the first time they sign in.
      </Alert>

      {children}
    </section>
  );
};

export default CredentialPanel;
