import { h } from 'preact';
import { useCallback } from 'preact/hooks';
import { useTranslations } from '@embedpdf/plugin-i18n/preact';
import {
  useSignatureEntries,
  useActivePlacement,
  SignatureEntry,
  SignatureFieldKind,
  SignatureMode,
} from '@embedpdf/plugin-signature/preact';
import { useCapability } from '@embedpdf/core/preact';
import { UIPlugin } from '@embedpdf/plugin-ui';
import { Icon } from './ui/icon';

export interface SignatureSidebarProps {
  documentId: string;
}

export function SignatureSidebar({ documentId }: SignatureSidebarProps) {
  const { translate } = useTranslations(documentId);
  const { entries, provides: capability } = useSignatureEntries();
  const activePlacement = useActivePlacement(documentId);
  const { provides: uiCapability } = useCapability<UIPlugin>('ui');

  const mode = capability?.mode ?? SignatureMode.SignatureOnly;
  const showInitials = mode === SignatureMode.SignatureAndInitials;

  const handleCreate = useCallback(() => {
    if (!uiCapability) return;
    uiCapability.forDocument(documentId).openModal('signature-create-modal');
  }, [uiCapability, documentId]);

  const handlePlaceSignature = useCallback(
    (entryId: string) => {
      if (!capability) return;
      capability.forDocument(documentId).activateSignaturePlacement(entryId);
    },
    [capability, documentId],
  );

  const handlePlaceInitials = useCallback(
    (entryId: string) => {
      if (!capability) return;
      capability.forDocument(documentId).activateInitialsPlacement(entryId);
    },
    [capability, documentId],
  );

  const handleRemove = useCallback(
    (e: Event, entryId: string) => {
      e.stopPropagation();
      if (!capability) return;
      capability.removeEntry(entryId);
    },
    [capability],
  );

  const isActive = (entryId: string, kind: SignatureFieldKind) =>
    activePlacement?.entryId === entryId && activePlacement?.kind === kind;

  return (
    <div class="flex h-full flex-col">
      <div class="border-border-subtle border-b p-3">
        <h2 class="text-fg-primary text-md font-semibold">
          {translate('signature.title', { fallback: 'Signatures' })}
        </h2>
        <button
          class="bg-accent hover:bg-accent-hover text-fg-on-accent mt-3 w-full rounded-md px-3 py-2 text-sm font-medium transition-colors"
          onClick={handleCreate}
        >
          {translate(showInitials ? 'signature.createNewWithInitials' : 'signature.createNew', {
            fallback: showInitials ? 'Create Signature & Initials' : 'Create New Signature',
          })}
        </button>
      </div>

      {entries.length > 0 ? (
        <div class="flex-1 overflow-y-auto p-4">
          <div class="flex flex-col gap-4">
            {entries.map((entry: SignatureEntry) => (
              <div
                key={entry.id}
                class="border-border-subtle bg-bg-surface hover:border-fg-muted/30 flex flex-col gap-2 rounded-lg border p-3 shadow-sm transition-all hover:shadow-md"
              >
                <div class="flex items-start justify-between">
                  {/* Title area */}
                  <div class="flex flex-1 items-center gap-2 pl-0.5 pt-0.5">
                    <span class="text-fg-muted text-[10px] font-semibold uppercase tracking-widest">
                      {translate('signature.placeSignature', { fallback: 'Signature' })}
                    </span>
                    {showInitials && entry.initials && (
                      <span class="text-border-default text-[10px]">•</span>
                    )}
                    {showInitials && entry.initials && (
                      <span class="text-fg-muted text-[10px] font-semibold uppercase tracking-widest">
                        {translate('signature.placeInitials', { fallback: 'Initials' })}
                      </span>
                    )}
                  </div>

                  {/* Action area */}
                  <button
                    class="text-fg-muted hover:text-fg-danger hover:bg-danger/10 -mr-1 -mt-1 flex rounded p-1.5 transition-colors"
                    onClick={(e: Event) => handleRemove(e, entry.id)}
                    title={translate('signature.remove', { fallback: 'Remove signature' })}
                  >
                    <Icon icon="trash" className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div class="flex gap-3">
                  {/* Signature field */}
                  <div
                    class={`flex h-16 cursor-pointer items-center justify-center rounded-md border border-dashed transition-all ${
                      showInitials && entry.initials ? 'flex-[2]' : 'flex-1'
                    } ${
                      isActive(entry.id, SignatureFieldKind.Signature)
                        ? 'border-accent bg-accent/5 ring-accent ring-2 ring-offset-1'
                        : 'border-border-default hover:border-fg-muted hover:bg-interactive-hover'
                    }`}
                    onClick={() => handlePlaceSignature(entry.id)}
                  >
                    <img
                      src={entry.signature.previewDataUrl}
                      class="h-12 max-w-[90%] object-contain"
                      alt="Signature"
                    />
                  </div>

                  {/* Initials field */}
                  {showInitials && entry.initials && (
                    <div
                      class={`flex h-16 flex-1 cursor-pointer items-center justify-center rounded-md border border-dashed transition-all ${
                        isActive(entry.id, SignatureFieldKind.Initials)
                          ? 'border-accent bg-accent/5 ring-accent ring-2 ring-offset-1'
                          : 'border-border-default hover:border-fg-muted hover:bg-interactive-hover'
                      }`}
                      onClick={() => handlePlaceInitials(entry.id)}
                    >
                      <img
                        src={entry.initials.previewDataUrl}
                        class="h-10 max-w-[80%] object-contain"
                        alt="Initials"
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div class="text-fg-muted mt-8 flex flex-col items-center gap-2 p-4">
          <Icon icon="signature" className="h-18 w-18 text-fg-muted opacity-50" />
          <div class="text-fg-muted max-w-[180px] text-center text-sm">
            {translate('signature.emptyState', {
              fallback: 'No signatures yet. Create one to get started.',
            })}
          </div>
        </div>
      )}
    </div>
  );
}
