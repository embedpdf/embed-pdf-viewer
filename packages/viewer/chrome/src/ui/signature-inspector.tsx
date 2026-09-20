/**
 * The validation popover (`signature-inspector` surface): what a signed
 * field's signature says and whether it holds — the four independent facts
 * (integrity, cryptography, trust, changes since) and the signer's claims,
 * anchored at the widget when its box is known, plus the signed revision as
 * a download (the exact bytes the signature covers). Mounted in the Stage
 * overlay so `<Anchored>` can project onto the page.
 */
import { useEffect, useState } from 'react';
import { Anchored } from '@embedpdf/react/anchored';
import { useSelector } from '@embedpdf/react/runtime';
import { FormToken } from '@embedpdf/react/form';
import { useSurface } from '@embedpdf/react/shell';
import { useT } from '@embedpdf/react/i18n';
import {
  useSignature,
  useSignatureSnapshot,
  useSignatureVerdicts,
  type FormFieldRef,
  type SignatureVerdict,
} from '@embedpdf/react/signature';
import { Icon } from './icons';

const verdictKey = (v: SignatureVerdict | null): string =>
  !v
    ? 'demo.verdictIndeterminate'
    : v.summary === 'valid'
      ? 'demo.verdictValid'
      : v.summary === 'valid-untrusted'
        ? 'demo.verdictValidUntrusted'
        : v.summary === 'invalid'
          ? v.modifications.basis === 'working-copy'
            ? 'demo.verdictWillInvalidate'
            : 'demo.verdictInvalid'
          : 'demo.verdictIndeterminate';

/** A PDF date string (`D:YYYYMMDDHHmmSSZ` or with a zone offset) as a locale date; the raw text when it is not one. */
const pdfDate = (raw: string): string => {
  const m = /^D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?(Z|[+-]\d{2}'?\d{2}'?)?/.exec(raw);
  if (!m) return raw;
  const [, y, mo = '01', d = '01', h = '00', mi = '00', s = '00', zone] = m;
  const offset =
    !zone || zone === 'Z'
      ? 'Z'
      : `${zone[0]}${zone.slice(1, 3)}:${zone.slice(3).replace(/'/g, '') || '00'}`;
  const date = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}${offset}`);
  return Number.isNaN(date.getTime()) ? raw : date.toLocaleString();
};

const tone = (summary: SignatureVerdict['summary'] | null): string =>
  summary === 'valid'
    ? 'text-green-600'
    : summary === 'invalid'
      ? 'text-red-600'
      : summary === 'valid-untrusted'
        ? 'text-amber-600'
        : 'text-fg-muted';

export function SignatureInspector() {
  const t = useT();
  const surface = useSurface('signature-inspector');
  const signature = useSignature();
  const snapshot = useSignatureSnapshot();
  const verdicts = useSignatureVerdicts();
  const [validating, setValidating] = useState(false);
  const field = surface.props?.field as FormFieldRef | undefined;
  const dto = field ? signature.signatureOf(field) : null;
  const verdict = field ? signature.verdictOf(field) : null;
  const widget = dto?.widget ?? null;
  const box = useSelector(FormToken, (c) =>
    widget && widget.annotObjectNumber > 0
      ? (c.fillItem(widget.annotObjectNumber)?.box ?? null)
      : null,
  );

  // Open on a field never validated: judge it now.
  useEffect(() => {
    if (!surface.isOpen || !dto?.signed || verdicts) return;
    setValidating(true);
    void signature.validate().finally(() => setValidating(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surface.isOpen, dto?.index]);

  if (!surface.isOpen || !field || !dto || !snapshot) return null;

  const revalidate = () => {
    setValidating(true);
    void signature.validate().finally(() => setValidating(false));
  };
  const summary = verdict?.summary ?? null;
  const modifications = verdict?.modifications.verdict ?? null;
  const row = (label: string, value: string, className = 'text-fg') => (
    <div className="flex items-baseline justify-between gap-3 text-xs">
      <span className="text-fg-muted">{label}</span>
      <span className={`text-right ${className}`}>{value}</span>
    </div>
  );

  const card = (
    <div className="border-border bg-elevated w-72 rounded-lg border p-3 text-sm shadow-xl">
      <div className="flex items-center justify-between">
        <span className="text-fg font-semibold">{t('demo.inspectTitle')}</span>
        <button
          type="button"
          onClick={surface.close}
          className="text-fg-muted hover:bg-hover grid h-6 w-6 place-items-center rounded"
          aria-label={t('demo.cancel')}
        >
          <Icon name="x" size={14} />
        </button>
      </div>
      <p className={`mt-1 text-sm font-medium ${tone(summary)}`}>
        {validating ? t('demo.signaturesValidating') : t(verdictKey(verdict))}
      </p>
      <div className="mt-2 flex flex-col gap-1">
        {row(t('demo.inspectSigner'), dto.signer.name ?? '—')}
        {dto.signer.reason ? row(t('demo.inspectReason'), dto.signer.reason) : null}
        {dto.signer.location ? row(t('demo.inspectLocation'), dto.signer.location) : null}
        {dto.signer.claimedTime
          ? row(t('demo.inspectTime'), pdfDate(dto.signer.claimedTime))
          : null}
      </div>
      <div className="border-border-subtle mt-2 flex flex-col gap-1 border-t pt-2">
        {row(
          t('demo.inspectIntegrity'),
          verdict?.integrity ?? '—',
          tone(
            verdict?.integrity === 'valid'
              ? 'valid'
              : verdict?.integrity === 'invalid'
                ? 'invalid'
                : null,
          ),
        )}
        {row(t('demo.inspectCryptography'), verdict?.cryptography ?? '—')}
        {row(t('demo.inspectTrust'), verdict?.trust ?? '—')}
        {row(
          t('demo.inspectChanges'),
          modifications === 'unchanged'
            ? verdict?.modifications.undone
              ? t('demo.verdictRestored')
              : t('demo.verdictUnchanged')
            : modifications === 'permitted'
              ? t('demo.verdictPermitted')
              : modifications === 'forbidden'
                ? t('demo.verdictForbidden')
                : '—',
          modifications === 'forbidden' ? 'text-red-600' : 'text-fg',
        )}
        {verdict?.modifications.laterRevisions
          ? row(t('demo.inspectLaterRevisions'), String(verdict.modifications.laterRevisions))
          : null}
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          disabled={validating}
          onClick={revalidate}
          className="border-border text-fg hover:bg-hover rounded-md border px-2 py-1 text-xs disabled:opacity-60"
        >
          {t('demo.signaturesValidate')}
        </button>
        <DownloadRevision field={field} />
      </div>
    </div>
  );

  if (widget?.page && box) {
    return (
      <Anchored anchor={{ page: widget.page, bounds: box }} placement="bottom" gap={8}>
        {card}
      </Anchored>
    );
  }
  return <div className="absolute right-4 top-4 z-40">{card}</div>;
}

/** The signed revision — the exact bytes the signature covers — as a file. */
function DownloadRevision({ field }: { field: FormFieldRef }) {
  const t = useT();
  const signature = useSignature();
  const dto = signature.signatureOf(field);
  const [busy, setBusy] = useState(false);
  if (!dto || dto.revisionIndex === null) return null;
  const revisionIndex = dto.revisionIndex;
  const run = async () => {
    setBusy(true);
    try {
      const bytes = await signature.revisionBytes(revisionIndex);
      const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${dto.fieldName}-signed.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[embedpdf] signed revision download failed:', err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void run()}
      className="border-border text-fg hover:bg-hover rounded-md border px-2 py-1 text-xs disabled:opacity-60"
    >
      {t('demo.inspectDownload')}
    </button>
  );
}
