import { useState, useEffect } from 'react';

export function useHashRoute() {
  const [route, setRoute] = useState(() => {
    return window.location.hash.slice(1) || '/';
  });

  useEffect(() => {
    const handleHashChange = () => {
      setRoute(window.location.hash.slice(1) || '/');
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const navigate = (path: string) => {
    window.location.hash = path;
  };

  return { route, navigate };
}
