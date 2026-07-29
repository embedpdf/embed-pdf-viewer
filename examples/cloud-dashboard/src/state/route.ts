import { useCallback, useEffect, useState } from 'react';

/**
 * URL-param routing, deliberately hand-rolled: two screens and a couple of
 * query keys don't justify a router dependency, and keeping state in the URL
 * means every view in this demo is linkable — which matters when you're
 * showing someone "open this document as Alice".
 */
export interface Route {
  /** Document being viewed, or null for the library. */
  docId: string | null;
  /** Which share (identity) the viewer is bound to. */
  shareId: string | null;
}

function read(): Route {
  const params = new URLSearchParams(window.location.search);
  return {
    docId: params.get('doc'),
    shareId: params.get('share'),
  };
}

export function useRoute(): [Route, (next: Partial<Route>) => void] {
  const [route, setRoute] = useState<Route>(read);

  useEffect(() => {
    const onPop = () => setRoute(read());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((next: Partial<Route>) => {
    const merged = { ...read(), ...next };
    const params = new URLSearchParams();
    if (merged.docId) params.set('doc', merged.docId);
    if (merged.shareId) params.set('share', merged.shareId);
    const search = params.toString();
    window.history.pushState({}, '', search ? `?${search}` : window.location.pathname);
    setRoute(merged);
  }, []);

  return [route, navigate];
}
