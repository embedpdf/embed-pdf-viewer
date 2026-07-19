/**
 * Boot-state panes for the document area — what renders INSTEAD of the Stage
 * while the selected tab's document isn't ready:
 *
 *   `locked` → <PasswordPrompt/>  (per-tab, v2's document-password-prompt port)
 *   `error`  → <DocumentError/>
 *
 * Both are per-TAB, not modal: several tabs can be locked/broken at once and
 * switching tabs stays free. The prompt drives ONE call —
 * `documents.unlock(id, { password })` — identical on the local (worker loads
 * the parked bytes) and cloud (/access grant) engines. The "incorrect" copy
 * keys on a real rejection: either this session's failed attempt, or
 * `passwordProvided` (a config-supplied password the engine already rejected).
 */
import { useState } from 'react';
import { useDocumentId, useDocuments } from '@embedpdf-x/react/runtime';
import { useT } from '@embedpdf-x/react/i18n';
import { Icon } from './icons';

export function PasswordPrompt() {
  const docId = useDocumentId();
  const { docs, unlock, close } = useDocuments();
  const t = useT();
  const [password, setPassword] = useState('');
  const [rejected, setRejected] = useState(false);
  const [busy, setBusy] = useState(false);

  const doc = docs.find((d) => d.id === docId);
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
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void submit()}
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

export function DocumentError() {
  const docId = useDocumentId();
  const { docs, close } = useDocuments();
  const t = useT();
  const doc = docs.find((d) => d.id === docId);
  if (!docId || !doc) return null;

  return (
    <div className="bg-app flex h-full w-full items-center justify-center p-8">
      <div className="bg-surface border-border flex max-w-sm flex-col items-center rounded-xl border p-6 text-center shadow-lg">
        <div className="mb-4 rounded-full bg-red-500/10 p-4">
          <Icon name="alertTriangle" size={28} className="text-red-500" />
        </div>
        <h3 className="text-fg text-lg font-semibold">{t('documentError.title')}</h3>
        {doc.name && <p className="text-fg-muted mt-1 text-sm">{doc.name}</p>}
        <p className="text-fg-secondary mt-2 text-sm">{t('documentError.unknown')}</p>
        <button
          type="button"
          onClick={() => void close(docId)}
          className="bg-accent text-on-accent mt-5 w-full cursor-pointer rounded-md px-4 py-2.5 text-sm font-medium transition-colors hover:opacity-90"
        >
          {t('documentError.close')}
        </button>
      </div>
    </div>
  );
}
