/**
 * Boot-state panes for the document area — what renders instead of the Stage
 * while the selected tab's document isn't ready:
 *
 *   `locked` → <PasswordPrompt/>
 *   `error`  → <DocumentError/>, which says why and can try again
 *
 * Both are per-tab, not modal: several tabs can be locked/broken at once and
 * switching tabs stays free. The prompt drives one call —
 * `documents.unlock(id, { password })` — identical on the local (worker loads
 * the parked bytes) and cloud (/access grant) engines. The "incorrect" copy
 * keys on a real rejection: either this session's failed attempt, or
 * `passwordProvided` (a config-supplied password the engine already rejected).
 */
import { useT } from '@embedpdf/react/i18n';
import {
  useDocumentId,
  useDocuments,
  useDocumentsState,
  type PluginErrorInfo,
} from '@embedpdf/react/runtime';
import { useState } from 'react';

import { Icon } from './icons';

export function PasswordPrompt() {
  const docId = useDocumentId();
  const { unlock, close } = useDocuments();
  const docs = useDocumentsState((state) => state.documents);
  const t = useT();
  const [password, setPassword] = useState('');
  const [rejected, setRejected] = useState(false);
  const [busy, setBusy] = useState(false);

  const doc = docs.find((documentInfo) => documentInfo.id === docId);
  if (!docId || !doc) return null;
  const incorrect = rejected || doc.passwordProvided === true;

  const submit = async () => {
    if (busy || !password.trim()) return;
    setBusy(true);
    try {
      await unlock(docId, { password });
      // success → the tab promotes to ready and this pane unmounts
    } catch {
      setRejected(true);
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-app flex h-full w-full items-center justify-center p-8">
      <div className="bg-surface border-border w-full max-w-sm rounded-xl border p-6 shadow-lg">
        <div className="flex flex-col items-center text-center">
          <div className="bg-accent-light mb-4 rounded-full p-4">
            <Icon name="lock" size={28} className="text-accent" />
          </div>
          <h3 className="text-fg text-lg font-semibold">{t('passwordPrompt.title')}</h3>
          {doc.name && <p className="text-fg-muted mt-1 text-sm">{doc.name}</p>}
        </div>

        <p className="text-fg-secondary mt-4 text-center text-sm">
          {incorrect ? t('passwordPrompt.incorrect') : t('passwordPrompt.required')}
        </p>

        <div className="mt-5">
          <label className="text-fg mb-1.5 block text-sm font-medium" htmlFor="doc-password">
            {t('passwordPrompt.label')}
          </label>
          <input
            id="doc-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && void submit()}
            disabled={busy}
            placeholder={t('passwordPrompt.placeholder')}
            className="bg-surface border-border focus:border-accent focus:ring-accent text-fg placeholder:text-fg-muted block w-full rounded-md border px-3 py-2.5 text-sm focus:outline-none focus:ring-1 disabled:opacity-50"
            autoFocus
          />
        </div>

        {incorrect && (
          <div className="mt-3 flex items-center gap-2 rounded-md border border-red-500/40 bg-red-500/10 p-3">
            <Icon name="alertTriangle" size={16} className="flex-shrink-0 text-red-500" />
            <p className="text-sm text-red-500">{t('passwordPrompt.incorrectWarning')}</p>
          </div>
        )}

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={() => void close(docId)}
            disabled={busy}
            className="border-border text-fg-secondary hover:bg-hover flex-1 cursor-pointer rounded-md border px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
          >
            {t('passwordPrompt.cancel')}
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy || !password.trim()}
            className="bg-accent text-on-accent flex-1 cursor-pointer rounded-md px-4 py-2.5 text-sm font-medium transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? t('passwordPrompt.opening') : t('passwordPrompt.open')}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * The key of the words that say why a document couldn't be opened, from its error's code: it
 * isn't there, the user may not open it, it isn't a PDF (or is damaged), this engine can't open
 * it, or something else went wrong.
 */
export function errorReasonKeyOf(error: PluginErrorInfo | undefined): string {
  switch (error?.code) {
    case 'not-found':
      return 'documentError.notFound';
    case 'permission-denied':
      return 'documentError.notAllowed';
    case 'invalid-input':
      return 'documentError.damaged';
    case 'unsupported':
      return 'documentError.unsupported';
    default:
      return 'documentError.unknown';
  }
}

/**
 * A document that couldn't be opened: why, **Try again** (the same source, in the same tab), and
 * Close.
 */
export function DocumentError() {
  const docId = useDocumentId();
  const { close, retry } = useDocuments();
  const docs = useDocumentsState((state) => state.documents);
  const t = useT();
  const doc = docs.find((documentInfo) => documentInfo.id === docId);
  if (!docId || !doc) return null;

  return (
    <div className="bg-app flex h-full w-full items-center justify-center p-8">
      <div
        role="alert"
        className="bg-surface border-border flex max-w-sm flex-col items-center rounded-xl border p-6 text-center shadow-lg"
      >
        <div className="mb-4 rounded-full bg-red-500/10 p-4">
          <Icon name="alertTriangle" size={28} className="text-red-500" />
        </div>
        <h3 className="text-fg text-lg font-semibold">{t('documentError.title')}</h3>
        {doc.name && <p className="text-fg-muted mt-1 text-sm">{doc.name}</p>}
        <p className="text-fg-secondary mt-2 text-sm" data-epdf-error-reason="">
          {t(errorReasonKeyOf(doc.error))}
        </p>
        <div className="mt-5 flex w-full gap-3">
          <button
            type="button"
            onClick={() => void close(docId)}
            className="border-border text-fg-secondary hover:bg-hover flex-1 cursor-pointer rounded-md border px-4 py-2.5 text-sm font-medium transition-colors"
          >
            {t('documentError.close')}
          </button>
          {/* The tab shows it loading at once, and this again if it fails again. */}
          <button
            type="button"
            onClick={() => void retry(docId).catch(() => {})}
            className="bg-accent text-on-accent flex-1 cursor-pointer rounded-md px-4 py-2.5 text-sm font-medium transition-colors hover:opacity-90"
          >
            {t('documentError.retry')}
          </button>
        </div>
      </div>
    </div>
  );
}
