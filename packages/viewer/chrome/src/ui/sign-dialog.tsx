/**
 * The sign dialog (`signature-sign` modal surface): a mark met a field and
 * the mode is `ask` — or a "sign here" flow wants the facts first. Shows
 * the mark as it will sit in the field, takes reason and location, offers
 * a certification when the config allows it, and either SEALS the field
 * (`signField`) or only draws the mark into it (`fillField`).
 */
import { useState } from 'react';
import { useSurface } from '@embedpdf/react/shell';
import { useT } from '@embedpdf/react/i18n';
import { useStampAssetPreviewUrl } from '@embedpdf/react/stamp';
import { useSignature, type FormFieldRef, type Mark } from '@embedpdf/react/signature';

export function SignDialog() {
  const t = useT();
  const surface = useSurface('signature-sign');
  const signature = useSignature();
  const [reason, setReason] = useState('');
  const [location, setLocation] = useState('');
  // What the signature declares about later changes: a plain approval (form
  // filling and further signatures keep it valid; Acrobat's reading), or a
  // certification with its DocMDP permission. Only the FIRST signature can certify.
  const [signKind, setSignKind] = useState<'approval' | 'certify-3' | 'certify-2' | 'certify-1'>(
    'approval',
  );
  const [busy, setBusy] = useState<'sign' | 'fill' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const field = surface.props?.field as FormFieldRef | undefined;
  const mark = surface.props?.mark as Mark | undefined;
  const assetId = mark && 'assetId' in mark ? mark.assetId : null;
  const preview = useStampAssetPreviewUrl(assetId);
  if (!surface.isOpen || !field || !mark) return null;

  const attribution = {
    ...(reason.trim() ? { reason: reason.trim() } : {}),
    ...(location.trim() ? { location: location.trim() } : {}),
  };
  const run = async (kind: 'sign' | 'fill') => {
    setBusy(kind);
    setError(null);
    try {
      if (kind === 'sign') {
        await signature.signField({
          field,
          mark,
          attribution,
          ...(signKind !== 'approval' && signature.canCertify()
            ? { certify: { permission: Number(signKind.slice(-1)) as 1 | 2 | 3 } }
            : {}),
        });
      } else {
        await signature.fillField(field, mark);
      }
      surface.close();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const input = 'border-border bg-surface text-fg w-full rounded border px-2 py-1.5 text-sm';
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40">
      <div className="border-border bg-surface w-96 rounded-lg border p-4 shadow-xl">
        <h2 className="text-fg text-base font-semibold">{t('demo.signTitle')}</h2>
        <div className="border-border-subtle mt-3 flex h-24 items-center justify-center rounded-md border p-2">
          {preview ? (
            <img src={preview} alt="" className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-fg-muted text-sm">{t('demo.signatureLabel')}</span>
          )}
        </div>
        <label className="text-fg-muted mt-3 block text-xs">
          {t('demo.signReason')}
          <input value={reason} onChange={(e) => setReason(e.target.value)} className={input} />
        </label>
        <label className="text-fg-muted mt-2 block text-xs">
          {t('demo.signLocation')}
          <input value={location} onChange={(e) => setLocation(e.target.value)} className={input} />
        </label>
        {signature.canCertify() ? (
          <label className="text-fg-muted mt-3 block text-xs">
            {t('demo.signKind')}
            <select
              value={signKind}
              onChange={(e) => setSignKind(e.target.value as typeof signKind)}
              className={input}
            >
              <option value="approval">{t('demo.signKindApproval')}</option>
              <option value="certify-3">{t('demo.signKindCertifyAnnotate')}</option>
              <option value="certify-2">{t('demo.signKindCertifyFill')}</option>
              <option value="certify-1">{t('demo.signKindCertifyLocked')}</option>
            </select>
          </label>
        ) : null}
        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            disabled={busy != null}
            onClick={surface.close}
            className="border-border text-fg hover:bg-hover rounded-md border px-3 py-1.5 text-sm"
          >
            {t('demo.cancel')}
          </button>
          {signature.canFill() ? (
            <button
              type="button"
              disabled={busy != null}
              onClick={() => void run('fill')}
              className="border-border text-fg hover:bg-hover rounded-md border px-3 py-1.5 text-sm disabled:opacity-60"
            >
              {t('demo.signFill')}
            </button>
          ) : null}
          {signature.canSign() ? (
            <button
              type="button"
              disabled={busy != null}
              onClick={() => void run('sign')}
              className="bg-accent text-on-accent rounded-md px-3 py-1.5 text-sm disabled:opacity-60"
            >
              {busy === 'sign' ? t('demo.signSigning') : t('demo.signButton')}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
