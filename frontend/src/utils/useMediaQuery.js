import { useEffect, useState } from 'react';

// Layout decisions that CSS cannot make on its own.
//
// Most of the responsive work in this app is done in stylesheets, where it
// belongs. This exists for the one case that is not a matter of styling: the
// quiz shows ONE question at a time on a phone and ALL of them on a desktop,
// which is a difference in what is rendered, not in how it looks (NFR-USE-02).
//
// Reads the query at mount and follows it afterwards, so rotating a phone from
// portrait to landscape re-lays-out rather than leaving the narrow form on a
// wide screen.
export const useMediaQuery = (query) => {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches
  );

  useEffect(() => {
    const list = window.matchMedia(query);
    const update = (event) => setMatches(event.matches);

    setMatches(list.matches);
    list.addEventListener('change', update);
    return () => list.removeEventListener('change', update);
  }, [query]);

  return matches;
};

export default useMediaQuery;
