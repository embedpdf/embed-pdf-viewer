import { useEffect, useState } from 'preact/hooks'; // or react/hooks

export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id); // cancel if value changes early
  }, [value, delay]);

  return debounced;
}
