import { useEffect } from 'react';
import { useDocument } from '@embedpdf/react/runtime';

export function UnsavedWarning() {
  const { hasUnsavedChanges } = useDocument();

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasUnsavedChanges]);

  return hasUnsavedChanges ? <span>Unsaved changes</span> : null;
}
