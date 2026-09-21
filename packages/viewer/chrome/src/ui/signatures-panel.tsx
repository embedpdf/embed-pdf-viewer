/**
 * The signatures sidebar (right panel) — Preview's signature sheet on v3
 * parts. One row per PERSON: a stamp library of kind `signatures` holding a
 * full signature and, optionally, initials. Nothing is stored beyond the
 * file; rename/export/delete are the library verbs.
 *
 *   pick a mark → with a TARGET field ("sign here" was clicked, or a
 *   signature widget selected) the mark goes into that field by the
 *   plugin's mode; otherwise it ARMS — hover a page for the ghost, click a
 *   signature field to sign it, click anywhere else to drop it as a stamp.
 *
 * Below the people: the signature fields of THIS document, signed or not,
 * with their verdicts — click an unsigned one to target it, a signed one to
 * inspect it.
 */
import { useEffect, useState } from 'react';
import { useTool } from '@embedpdf/react/interaction';
import { useT } from '@embedpdf/react/i18n';
import { useSurface } from '@embedpdf/react/shell';
import {
  useArmStampAsset,
  useStamp,
  useStampAssetPreviewUrl,
  type StampAsset,
} from '@embedpdf/react/stamp';
import {
  useSignature,
  useSignatureSnapshot,
  useSignatureTarget,
  useSignatureVerdicts,
  useSignatureEvent,
  useSignerRows,
  type SignatureDTO,
  type SignatureVerdict,
  type SignerRow,
} from '@embedpdf/react/signature';
import { useSignaturesConfig } from '../config-context';
import { Icon } from './icons';
import { restoreStampLibrariesOnce } from './stamp-store';

const fieldLabel = (
  field: { kind: 'fqn'; name: string } | { kind: 'objectNumber'; fieldObjectNumber: number },
): string => (field.kind === 'fqn' ? field.name : `#${field.fieldObjectNumber}`);

export function SignaturesPanel() {
  const t = useT();
  const stamp = useStamp();
  const signature = useSignature();
  const config = useSignaturesConfig();
  const rows = useSignerRows();
  const { target, busy } = useSignatureTarget();
  const { armAsset } = useArmStampAsset();
  const { activeToolId } = useTool();
  const maker = useSurface('signature-maker');
  const [armedId, setArmedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Acrobat's warning: an unsaved edit just turned a signature that held into
  // one a save would invalidate. Shown until the next verdicts land.
  const [invalidating, setInvalidating] = useState<string | null>(null);
  useSignatureEvent((event) => {
    if (event.type === 'invalidating')
      setInvalidating(signature.signatureOf(event.field)?.fieldName ?? fieldLabel(event.field));
    else if (
      event.type === 'validated' &&
      !event.verdicts.some(
        (v) => v.summary === 'invalid' && v.modifications.basis === 'working-copy',
      )
    )
      setInvalidating(null);
  });

  // The people live in the same store as the stamps: bring them back on
  // first open (a no-op when the store component already did).
  useEffect(() => {
    void restoreStampLibrariesOnce(stamp);
  }, [stamp]);
  useEffect(() => {
    if (activeToolId !== 'stamp') setArmedId(null);
  }, [activeToolId]);

  const pick = (asset: StampAsset) => {
    setError(null);
    if (target) {
      void signature.placeMark({ assetId: asset.id }, { field: target }).catch((err) => {
        console.error('[embedpdf] placing the mark failed:', err);
        setError(t('demo.signError'));
      });
      return;
    }
    setArmedId(asset.id);
    void armAsset(asset.id).catch((err) => {
      console.error('[embedpdf] arm mark failed:', err);
      setArmedId(null);
      setError(t('demo.stampsArmError'));
    });
  };

  const canAddPerson = (config.libraries ?? 'many') === 'many' || rows.length === 0;
  const wantsInitials = (config.kinds ?? ['signature', 'initials']).includes('initials');

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
            <Icon name="signature" size={32} className="text-fg-muted" />
            <p className="text-fg-muted text-sm">{t('demo.signaturesEmpty')}</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {rows.map((row) => (
              <SignerRowView
                key={row.libraryId}
                row={row}
                armedId={armedId}
                wantsInitials={wantsInitials}
                onPick={pick}
                onAddInitials={() =>
                  maker.open({ exclusive: 'modal', props: { libraryId: row.libraryId } })
                }
              />
            ))}
          </ul>
        )}
        <DocumentSignatures />
      </div>

      {invalidating && (
        <div className="border-border-subtle shrink-0 border-t px-3 py-2 text-xs text-amber-700">
          {t('demo.signaturesInvalidating', { params: { field: invalidating } })}
        </div>
      )}
      {(error || target || armedId) && (
        <div
          className={`border-border-subtle shrink-0 border-t px-3 py-2 text-xs ${
            error ? 'text-red-600' : 'text-fg-muted'
          }`}
        >
          {error ??
            (target
              ? busy
                ? t('demo.signSigning')
                : t('demo.signaturesTargetHint')
              : t('demo.signaturesArmedHint'))}
        </div>
      )}

      {canAddPerson ? (
        <div className="border-border-subtle shrink-0 border-t p-3">
          <button
            type="button"
            onClick={() => maker.open({ exclusive: 'modal' })}
            className="border-border text-fg hover:bg-hover flex w-full items-center justify-center gap-2 rounded-md border px-3 py-1.5 text-sm"
          >
            <Icon name="plus" size={16} />
            {t('demo.signaturesNew')}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function SignerRowView({
  row,
  armedId,
  wantsInitials,
  onPick,
  onAddInitials,
}: {
  row: SignerRow;
  armedId: string | null;
  wantsInitials: boolean;
  onPick: (asset: StampAsset) => void;
  onAddInitials: () => void;
}) {
  const t = useT();
  const stamp = useStamp();
  const [renaming, setRenaming] = useState<string | null>(null);

  const exportPdf = async () => {
    const bytes = await stamp.exportLibrary(row.libraryId).catch(() => null);
    if (!bytes) return;
    const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${row.name || 'signature'}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const commitRename = () => {
    const name = renaming?.trim();
    setRenaming(null);
    if (name && name !== row.name) void stamp.updateLibrary(row.libraryId, { name });
  };
  const iconButton = 'text-fg-muted hover:text-fg grid h-6 w-6 shrink-0 place-items-center rounded';

  return (
    <li className="border-border-subtle rounded-md border p-2">
      <div className="flex items-center gap-1">
        {renaming !== null ? (
          <input
            autoFocus
            value={renaming}
            onChange={(e) => setRenaming(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') setRenaming(null);
            }}
            className="border-border bg-surface text-fg min-w-0 flex-1 rounded border px-1.5 py-0.5 text-sm"
          />
        ) : (
          <span className="text-fg min-w-0 flex-1 truncate text-sm font-medium">{row.name}</span>
        )}
        <button
          type="button"
          onClick={() => setRenaming(row.name)}
          title={t('demo.signaturesRename')}
          className={iconButton}
        >
          <Icon name="pencilMarker" size={13} />
        </button>
        <button
          type="button"
          onClick={exportPdf}
          title={t('demo.signaturesExport')}
          className={iconButton}
        >
          <Icon name="download" size={13} />
        </button>
        <button
          type="button"
          onClick={() => void stamp.deleteLibrary(row.libraryId)}
          title={t('demo.signaturesRemove')}
          className={iconButton}
        >
          <Icon name="trash" size={13} />
        </button>
      </div>
      <div className="mt-2 grid grid-cols-[2fr_1fr] gap-2">
        {row.signatures.map((asset) => (
          <MarkThumb
            key={asset.id}
            asset={asset}
            label={t('demo.signatureLabel')}
            armed={armedId === asset.id}
            onPick={() => onPick(asset)}
          />
        ))}
        {wantsInitials ? (
          row.initials ? (
            <MarkThumb
              asset={row.initials}
              label={t('demo.initialsLabel')}
              armed={armedId === row.initials.id}
              onPick={() => onPick(row.initials!)}
            />
          ) : (
            <button
              type="button"
              onClick={onAddInitials}
              title={t('demo.signaturesAddInitials')}
              className="border-border-subtle text-fg-muted hover:bg-hover flex h-16 items-center justify-center rounded-md border border-dashed text-xs"
            >
              <Icon name="plus" size={14} />
            </button>
          )
        ) : null}
      </div>
    </li>
  );
}

function MarkThumb({
  asset,
  label,
  armed,
  onPick,
}: {
  asset: StampAsset;
  label: string;
  armed: boolean;
  onPick: () => void;
}) {
  const url = useStampAssetPreviewUrl(asset.id);
  return (
    <button
      type="button"
      onClick={onPick}
      title={label}
      aria-pressed={armed}
      className={`flex h-16 items-center justify-center rounded-md border p-1 ${
        armed
          ? 'border-accent bg-accent-light ring-accent ring-2'
          : 'border-border-subtle hover:border-border hover:bg-hover'
      }`}
    >
      {url ? (
        <img src={url} alt={label} className="max-h-full max-w-full object-contain" />
      ) : (
        <span className="text-fg-muted text-xs">{label}</span>
      )}
    </button>
  );
}

/** The signature fields of this document, with their state. */
function DocumentSignatures() {
  const t = useT();
  const signature = useSignature();
  const snapshot = useSignatureSnapshot();
  const verdicts = useSignatureVerdicts();
  const { target } = useSignatureTarget();
  const [validating, setValidating] = useState(false);
  const fields = snapshot?.signatures ?? [];
  const verdictOf = (dto: SignatureDTO) =>
    verdicts?.find((v) => v.signature.index === dto.index) ?? null;
  // Three honest states: valid; valid on disk but unsaved edits would
  // invalidate it (the verdict judged the working copy); invalid on disk.
  const verdictLabel = (v: SignatureVerdict | null): string =>
    !v
      ? t('demo.signaturesSigned')
      : v.summary === 'valid'
        ? t('demo.verdictValid')
        : v.summary === 'valid-untrusted'
          ? t('demo.verdictValidUntrusted')
          : v.summary === 'indeterminate'
            ? t('demo.verdictIndeterminate')
            : v.modifications.basis === 'working-copy'
              ? t('demo.verdictWillInvalidate')
              : t('demo.verdictInvalid');
  const verdictTone = (v: SignatureVerdict | null): string =>
    !v || v.summary === 'indeterminate'
      ? 'text-fg-muted'
      : v.summary === 'invalid'
        ? v.modifications.basis === 'working-copy'
          ? 'text-amber-600'
          : 'text-red-600'
        : v.summary === 'valid-untrusted'
          ? 'text-amber-600'
          : 'text-green-600';
  const isTarget = (dto: SignatureDTO) =>
    !!target &&
    (target.kind === 'fqn'
      ? target.name === dto.fieldName
      : target.fieldObjectNumber ===
        (dto.field.kind === 'objectNumber' ? dto.field.fieldObjectNumber : -1));
  const validate = () => {
    setValidating(true);
    void signature.validate().finally(() => setValidating(false));
  };

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between">
        <span className="text-fg-muted text-xs font-semibold uppercase tracking-wide">
          {t('demo.signaturesInDocument')}
        </span>
        {fields.some((f) => f.signed) ? (
          <button
            type="button"
            disabled={validating}
            onClick={validate}
            className="text-accent text-xs hover:underline disabled:opacity-60"
          >
            {validating ? t('demo.signaturesValidating') : t('demo.signaturesValidate')}
          </button>
        ) : null}
      </div>
      {fields.length === 0 ? (
        <p className="text-fg-muted mt-1 text-xs">{t('demo.signaturesNone')}</p>
      ) : (
        <ul className="mt-1 flex flex-col gap-1">
          {fields.map((dto) => {
            const verdict = verdictOf(dto);
            return (
              <li key={dto.index}>
                <button
                  type="button"
                  onClick={() =>
                    dto.signed ? signature.inspect(dto.field) : signature.setTarget(dto.field)
                  }
                  className={`hover:bg-hover flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
                    isTarget(dto) ? 'bg-accent-light' : ''
                  }`}
                >
                  <Icon
                    name={dto.signed ? 'check' : 'signature'}
                    size={14}
                    className={dto.signed ? 'text-green-600' : 'text-fg-muted'}
                  />
                  <span className="text-fg min-w-0 flex-1 truncate">{dto.fieldName}</span>
                  <span
                    className={`shrink-0 text-right text-xs ${dto.signed ? verdictTone(verdict) : 'text-fg-muted'}`}
                  >
                    {dto.signed ? verdictLabel(verdict) : t('demo.signaturesUnsigned')}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
