/**
 * The validation popover (`signature-inspector` surface): what a signed
 * field's signature says and whether it holds — the four independent facts
 * (integrity, cryptography, trust, changes since), the signer's claims and
 * the timestamp an authority vouches for, whether the signer's certificate
 * was withdrawn, and whether the file holds everything a reader needs to
 * check the signature with no network, with a button that adds what is
 * missing,
 * anchored at the widget when its box is known, plus the signed revision as
 * a download (the exact bytes the signature covers). Mounted in the Stage
 * overlay so `<Anchored>` can project onto the page.
 */
import { useEffect, useState } from 'react';
import { Anchored } from '@embedpdf/react/anchored';
import { FormToken } from '@embedpdf/react/form';
import { isPluginError, useOptionalCapability } from '@embedpdf/react/runtime';
import { useSurface } from '@embedpdf/react/shell';
import { useT } from '@embedpdf/react/i18n';
import { saveFile } from '@embedpdf/web';
import {
  useSignature,
  useSignatureState,
  type FormFieldRef,
  type SignatureVerdict,
} from '@embedpdf/react/signature';
import { useFormatLocale } from '../format-locale';
import { Icon } from './icons';

const verdictKey = (verdict: SignatureVerdict | null): string =>
  !verdict
    ? 'demo.verdictIndeterminate'
    : verdict.summary === 'valid'
      ? 'demo.verdictValid'
      : verdict.summary === 'valid-untrusted'
        ? 'demo.verdictValidUntrusted'
        : verdict.summary === 'invalid'
          ? verdict.modifications.basis === 'working-copy'
            ? 'demo.verdictWillInvalidate'
            : 'demo.verdictInvalid'
          : 'demo.verdictIndeterminate';

/** A day as the viewer's format language writes it; the text itself if it isn't one. */
const day = (iso: string, locale: string | undefined): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' });
};

/** The words for what keeps a signature from being checkable with no network. */
const GAP_KEYS = {
  'no-timestamp': 'demo.longTermNoTimestamp',
  untrusted: 'demo.longTermUntrusted',
  'no-answer': 'demo.longTermNoAnswer',
  revoked: 'demo.longTermRevoked',
} as const;

/**
 * The words for validation data that could not be added: an address that did not answer
 * (the engine's `Network` code underneath), or anything else.
 */
const addFailureKey = (error: unknown): string =>
  isPluginError(error) && (error as { cause?: { code?: unknown } }).cause?.code === 'Network'
    ? 'demo.longTermAddUnreachable'
    : 'demo.longTermAddFailed';

/** A moment as the viewer's format language writes it; the text itself if it isn't one. */
const dateTime = (iso: string, locale: string | undefined): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString(locale);
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
  const locale = useFormatLocale();
  const surface = useSurface('signature-inspector');
  const signature = useSignature();
  // Re-render when the signatures are read, and when one or its verdict changes.
  const status = useSignatureState((state) => state.status);
  useSignatureState((state) => state.signatures);
  const [validating, setValidating] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const field = surface.props?.field as FormFieldRef | undefined;
  const dto = field ? signature.getSignature(field) : null;
  const verdict = field ? signature.getVerdict(field) : null;
  const widget = dto?.widget ?? null;
  // Where the signature shows is its widget's row in the form. A box of no size shows nowhere
  // (a document timestamp's, an invisible signature's), so there is nothing to anchor at.
  const form = useOptionalCapability(FormToken);
  const rect = (widget && form?.getWidget(widget)?.rect) ?? null;
  const box = rect && rect.width > 0 && rect.height > 0 ? rect : null;

  // Open on a field never validated: judge it now.
  useEffect(() => {
    if (!surface.isOpen || !dto?.signed || signature.listVerdicts()) return;
    setValidating(true);
    void signature.validate().finally(() => setValidating(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surface.isOpen, dto?.index]);

  if (!surface.isOpen || !field || !dto || status !== 'ready') return null;

  const revalidate = () => {
    setValidating(true);
    void signature.validate().finally(() => setValidating(false));
  };
  const longTerm = verdict?.longTerm ?? null;
  const gap = longTerm?.missing[0] ?? null;
  const longTermDetail = !longTerm
    ? null
    : longTerm.enabled
      ? longTerm.expiresAt
        ? t('demo.longTermUntil', { params: { date: day(longTerm.expiresAt, locale) } })
        : null
      : gap
        ? t(GAP_KEYS[gap.reason], {
            params: { name: gap.certificate ?? t('demo.longTermUnnamed') },
          })
        : null;
  const addValidationInfo = () => {
    setAdding(true);
    setAddError(null);
    signature
      .addValidationInfo(field)
      .catch((error: unknown) => {
        console.error('[embedpdf] adding verification information failed:', error);
        setAddError(t(addFailureKey(error)));
      })
      .finally(() => setAdding(false));
  };
  const summary = verdict?.summary ?? null;
  const modifications = verdict?.modifications.verdict ?? null;
  // The time an authority vouches for, beside the one the signer claims: toned by whether the
  // token holds and its authority is trusted.
  const timestamp = verdict?.timestamp ?? null;
  const row = (label: string, value: string, className = 'text-fg') => (
    <div className="flex items-baseline justify-between gap-3 text-xs">
      <span className="text-fg-muted">{label}</span>
      <span className={`text-end ${className}`}>{value}</span>
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
        {dto.signer.signedAt
          ? row(t('demo.inspectTime'), dateTime(dto.signer.signedAt, locale))
          : null}
        {timestamp ? (
          <div className="flex items-baseline justify-between gap-3 text-xs">
            <span className="text-fg-muted">{t('demo.inspectTimestamp')}</span>
            <span className="text-end">
              <span className={tone(timestamp.summary)}>
                {timestamp.stampedAt ? dateTime(timestamp.stampedAt, locale) : '—'}
              </span>
              {timestamp.authorityName ? (
                <span className="text-fg-muted block">{timestamp.authorityName}</span>
              ) : null}
            </span>
          </div>
        ) : null}
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
        {verdict?.revocation === 'good'
          ? row(t('demo.inspectRevocation'), t('demo.revocationGood'))
          : verdict?.revocation === 'revoked'
            ? row(t('demo.inspectRevocation'), t('demo.revocationRevoked'), 'text-red-600')
            : null}
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
        {longTerm ? (
          <div className="flex items-baseline justify-between gap-3 text-xs" data-long-term>
            <span className="text-fg-muted shrink-0">{t('demo.inspectLongTerm')}</span>
            <span className="text-end">
              <span className={longTerm.enabled ? 'text-green-600' : 'text-fg'}>
                {t(longTerm.enabled ? 'demo.longTermEnabled' : 'demo.longTermNotEnabled')}
              </span>
              {longTermDetail ? (
                <span className="text-fg-muted block">{longTermDetail}</span>
              ) : null}
            </span>
          </div>
        ) : null}
      </div>
      {longTerm && !longTerm.enabled && signature.canAddValidationInfo() ? (
        <div className="mt-2">
          <button
            type="button"
            disabled={adding}
            onClick={addValidationInfo}
            className="border-border text-fg hover:bg-hover w-full rounded-md border px-2 py-1 text-xs disabled:opacity-60"
          >
            {adding ? t('demo.longTermAdding') : t('demo.longTermAdd')}
          </button>
          {addError ? <p className="mt-1 text-xs text-red-600">{addError}</p> : null}
        </div>
      ) : null}
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
  return <div className="absolute end-4 top-4 z-40">{card}</div>;
}

/** The signed revision — the exact bytes the signature covers — as a file. */
function DownloadRevision({ field }: { field: FormFieldRef }) {
  const t = useT();
  const signature = useSignature();
  const dto = signature.getSignature(field);
  const [busy, setBusy] = useState(false);
  if (!dto || dto.revisionIndex === null) return null;
  const revisionIndex = dto.revisionIndex;
  const run = async () => {
    setBusy(true);
    try {
      const bytes = await signature.readRevision({ revisionIndex });
      saveFile(bytes, `${dto.fieldName}-signed.pdf`, 'application/pdf');
    } catch (error) {
      console.error('[embedpdf] signed revision download failed:', error);
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
