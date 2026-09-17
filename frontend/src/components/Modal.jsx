import { useEffect, useRef, useState } from 'react';

// The project's first modal. UserDetail notes that one screen was not the place
// to introduce one; a row summary that every admin screen can reuse is.
//
// Two pieces of state rather than one, because an exit animation needs the
// panel to outlive `open`:
//   `mounted` - is it in the DOM at all
//   `shown`   - has the open class been applied, one frame later
// Applying the class a frame after mounting is what gives the transition a
// starting state to move from; setting both at once would jump straight to the
// end. EXIT_MS must stay in step with the transition duration in components.css.
const EXIT_MS = 180;

const Modal = ({ open, onClose, title, subtitle, children, footer }) => {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  const panelRef = useRef(null);
  const returnFocusRef = useRef(null);

  useEffect(() => {
    if (open) {
      // Remembered before the panel takes focus, so closing puts the caret back
      // on the row the admin came from rather than at the top of the document.
      returnFocusRef.current = document.activeElement;
      setMounted(true);
      const frame = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(frame);
    }

    setShown(false);
    const timer = setTimeout(() => setMounted(false), EXIT_MS);
    return () => clearTimeout(timer);
  }, [open]);

  // Escape closes, and the page behind does not scroll while the panel is up.
  useEffect(() => {
    if (!mounted) return undefined;

    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [mounted, onClose]);

  useEffect(() => {
    if (shown) panelRef.current?.focus();
  }, [shown]);

  useEffect(() => {
    if (!mounted && returnFocusRef.current) {
      returnFocusRef.current.focus?.();
      returnFocusRef.current = null;
    }
  }, [mounted]);

  if (!mounted) return null;

  return (
    <div
      className={`modal${shown ? ' modal--shown' : ''}`}
      // The backdrop closes on click, but only when the click started AND ended
      // on the backdrop itself: a drag that begins inside the panel and releases
      // outside it should not dismiss the thing being read.
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="modal__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
        ref={panelRef}
      >
        <header className="modal__head">
          <div>
            <h2 className="modal__title" id="modal-title">{title}</h2>
            {subtitle && <p className="modal__subtitle">{subtitle}</p>}
          </div>
          <button type="button" className="modal__close" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor"
              strokeWidth="1.6" strokeLinecap="round" aria-hidden="true" focusable="false"
            >
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </header>

        <div className="modal__body">{children}</div>

        {footer && <footer className="modal__foot">{footer}</footer>}
      </div>
    </div>
  );
};

export default Modal;
