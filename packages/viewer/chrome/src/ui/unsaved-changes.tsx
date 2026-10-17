/**
 * Changes that would be lost. A document has unsaved changes once it changed since it opened or
 * since its last download (`hasUnsavedChanges`, always false on an engine that stores every
 * change as it's made). While one has, leaving the page asks first ({@link LeaveWarning}), and
 * closing its tab asks first ({@link CloseUnsavedDialog}). What the app's code closes, or a new
 * `src` replaces, is the app's call and closes without asking.
 */
import { useT } from '@embedpdf/react/i18n';
import { useDocumentsState } from '@embedpdf/react/runtime';
import { useEffect, useId } from 'react';

import { Dialog } from './dialog';

/** While any document has unsaved changes, the browser asks before the page is left. */
export function LeaveWarning() {
  const unsaved = useDocumentsState((state) =>
    state.documents.some((document) => document.hasUnsavedChanges),
  );
  useEffect(() => {
    if (!unsaved) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // What browsers before Chrome 119 ask for; the text itself is the browser's own.
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsaved]);
  return null;
}

/** Asks before a tab with unsaved changes closes: Cancel keeps it, the other button closes it. */
export function CloseUnsavedDialog({
  name,
  onCancel,
  onClose,
}: {
  /** The name of the document whose tab would close, as its tab shows it. */
  name: string;
  onCancel: () => void;
  /** Close it, and lose its changes. */
  onClose: () => void;
}) {
  const t = useT();
  const titleId = useId();
  return (
    <Dialog
      labelledBy={titleId}
      onClose={onCancel}
      className="border-border bg-surface w-96 rounded-lg border p-4 shadow-xl"
    >
      <h2 id={titleId} className="text-fg text-base font-semibold">
        {t('closeUnsaved.title')}
      </h2>
      <p className="text-fg-muted mt-2 text-sm">{t('closeUnsaved.body', { params: { name } })}</p>
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="border-border text-fg hover:bg-hover rounded-md border px-3 py-1.5 text-sm"
        >
          {t('closeUnsaved.cancel')}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700"
        >
          {t('closeUnsaved.close')}
        </button>
      </div>
    </Dialog>
  );
}
