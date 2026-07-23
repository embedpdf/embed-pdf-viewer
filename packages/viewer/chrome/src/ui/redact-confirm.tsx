import { useState } from 'react';
import { useRedaction } from '@embedpdf/react/redaction';
import { useSurface } from '@embedpdf/react/shell';
import { useT } from '@embedpdf/react/i18n';

/**
 * The apply-all confirm modal (`redact-confirm` shell surface, `exclusive:
 * 'modal'` via the command router). Shows the pending count and the
 * CLIENT-SIDE collateral estimate — other annotations the apply will destroy —
 * before anything irreversible happens. The authoritative collateral count
 * comes back on the result.
 */
export function RedactConfirmModal() {
  const t = useT();
  const surface = useSurface('redact-confirm');
  const redaction = useRedaction();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!surface.isOpen) return null;

  const count = redaction.pendingCount();
  const collateral = redaction.estimateCollateral();

  const apply = async () => {
    setBusy(true);
    setError(null);
    try {
      await redaction.applyAll();
      surface.close();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40">
      <div className="border-border bg-surface w-96 rounded-lg border p-4 shadow-xl">
        <h2 className="text-fg text-base font-semibold">{t('demo.redactConfirmTitle')}</h2>
        <p className="text-fg-muted mt-2 text-sm">
          {t('demo.redactConfirmBody', { params: { count } })}
        </p>
        {collateral > 0 ? (
          <p className="mt-2 text-sm font-medium text-red-600">
            {t('demo.redactConfirmCollateral', { params: { count: collateral } })}
          </p>
        ) : null}
        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={surface.close}
            className="border-border text-fg hover:bg-hover rounded-md border px-3 py-1.5 text-sm"
          >
            {t('demo.cancel')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void apply()}
            className="rounded-md bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700 disabled:opacity-60"
          >
            {busy ? t('demo.redactApplying') : t('demo.redactApply')}
          </button>
        </div>
      </div>
    </div>
  );
}
