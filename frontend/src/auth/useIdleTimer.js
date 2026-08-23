import { useEffect, useRef } from 'react';

// US-005: "my session should expire after 30 minutes of inactivity, so that an
// unattended warehouse terminal cannot be used by someone else."
//
// This is a client-side convenience that ends the session promptly on a shared
// machine. The real limit is the 15-minute access cookie plus the server-side
// refresh-token expiry - a tampered-with browser cannot extend either.
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'touchstart', 'scroll'];

export const useIdleTimer = (onIdle, { timeoutMinutes = 30, enabled = true } = {}) => {
  const timerRef = useRef(null);
  const callbackRef = useRef(onIdle);

  // Kept in a ref so a re-created callback does not tear down and rebuild the
  // listeners on every render.
  useEffect(() => {
    callbackRef.current = onIdle;
  }, [onIdle]);

  useEffect(() => {
    if (!enabled) return undefined;

    const reset = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => callbackRef.current(), timeoutMinutes * 60 * 1000);
    };

    reset();
    ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, reset, { passive: true }));

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, reset));
    };
  }, [enabled, timeoutMinutes]);
};

export default useIdleTimer;
