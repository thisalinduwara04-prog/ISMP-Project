import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

import Icon from './Icon';

// Transient confirmation for something the user just did.
//
// What belongs in a toast and what does not:
//   toast  - "Reminder created for Dilhan", "Acknowledgement recorded". The user
//            acted, it worked, and they do not need the message afterwards.
//   Alert  - anything they have to act on, and every error. A message that
//            removes itself is no use for one, so failures stay on the page.
//
// One file rather than a provider, a context and a stack in three: it is a
// hundred lines and they are only ever used together (CLAUDE.md rule 2). No
// toast library either - this is a list, a timer and a live region.

const DISMISS_MS = 5000;

const GLYPH = {
  success: 'check',
  error: 'alert',
  warning: 'alert',
  info: 'info',
};

const ToastContext = createContext(null);

// Throws rather than returning a no-op when the provider is missing: a
// confirmation that silently never appears is a bug that survives to the demo.
export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>');
  return context;
};

const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  // Timers are cleared on dismiss so a toast closed by hand does not leave a
  // pending setState behind, and the id counter lives in a ref because two
  // toasts raised in the same tick would otherwise share a key.
  const timers = useRef(new Map());
  const nextId = useRef(0);

  const dismiss = useCallback((id) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback(
    ({ tone = 'success', title, message = '' }) => {
      const id = nextId.current;
      nextId.current += 1;

      setToasts((current) => [...current, { id, tone, title, message }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), DISMISS_MS)
      );

      return id;
    },
    [dismiss]
  );

  // Stable, so a component can list `notify` in an effect's dependencies
  // without re-running it on every render of this provider.
  const value = useMemo(() => ({ notify, dismiss }), [notify, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}

      {/* A live region, so each toast is announced as it arrives rather than
          being visual-only. `polite` and not `assertive`: these confirm work
          that has already succeeded and should not interrupt what is being
          read. Errors are announced by their own Alert, which is role="alert". */}
      <div className="toast-stack" role="status" aria-live="polite" aria-relevant="additions">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast--${toast.tone}`}>
            <Icon name={GLYPH[toast.tone] || 'info'} className="toast__glyph" />

            <div className="toast__body">
              <strong className="toast__title">{toast.title}</strong>
              {toast.message && <p className="toast__message">{toast.message}</p>}
            </div>

            <button
              type="button"
              className="toast__close"
              onClick={() => dismiss(toast.id)}
              aria-label={`Dismiss: ${toast.title}`}
            >
              <Icon name="close" className="shell-icon-btn__glyph" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export default ToastProvider;
