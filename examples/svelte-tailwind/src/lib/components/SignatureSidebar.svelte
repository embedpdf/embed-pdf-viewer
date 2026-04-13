<script lang="ts">
  import { useTranslations } from '@embedpdf/plugin-i18n/svelte';
  import {
    useSignatureEntries,
    useActivePlacement,
    useSignatureCapability,
    SignatureFieldKind,
    SignatureMode,
  } from '@embedpdf/plugin-signature/svelte';
  import type { SignatureEntry } from '@embedpdf/plugin-signature/svelte';
  import { useCapability } from '@embedpdf/core/svelte';
  import type { UIPlugin } from '@embedpdf/plugin-ui';
  import { TrashIcon, SignatureIcon } from './icons';

  interface Props {
    documentId: string;
  }

  let { documentId }: Props = $props();

  const { translate } = useTranslations(() => documentId);
  const signatureCapability = useSignatureCapability();
  const signatureEntries = useSignatureEntries();
  const activePlacementState = useActivePlacement(() => documentId);
  const uiCapability = useCapability<UIPlugin>('ui');

  const mode = $derived(signatureCapability.provides?.mode ?? SignatureMode.SignatureOnly);
  const showInitials = $derived(mode === SignatureMode.SignatureAndInitials);

  function handleCreate() {
    if (!uiCapability.provides) return;
    uiCapability.provides.forDocument(documentId).openModal('signature-create-modal');
  }

  function handlePlaceSignature(entryId: string) {
    if (!signatureCapability.provides) return;
    signatureCapability.provides.forDocument(documentId).activateSignaturePlacement(entryId);
  }

  function handlePlaceInitials(entryId: string) {
    if (!signatureCapability.provides) return;
    signatureCapability.provides.forDocument(documentId).activateInitialsPlacement(entryId);
  }

  function handleRemove(e: Event, entryId: string) {
    e.stopPropagation();
    if (!signatureCapability.provides) return;
    signatureCapability.provides.removeEntry(entryId);
  }

  function isActive(entryId: string, kind: SignatureFieldKind): boolean {
    const ap = activePlacementState.activePlacement;
    return ap?.entryId === entryId && ap?.kind === kind;
  }
</script>

<div class="flex h-full flex-col">
  <div class="border-b border-gray-200 p-3">
    <h2 class="text-md font-semibold text-gray-900">
      {translate('signature.title', { fallback: 'Signatures' })}
    </h2>
    <button
      class="mt-3 w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
      onclick={handleCreate}
    >
      {translate(showInitials ? 'signature.createNewWithInitials' : 'signature.createNew', {
        fallback: showInitials ? 'Create Signature & Initials' : 'Create New Signature',
      })}
    </button>
  </div>

  {#if signatureEntries.entries.length > 0}
    <div class="flex-1 overflow-y-auto p-4">
      <div class="flex flex-col gap-4">
        {#each signatureEntries.entries as entry (entry.id)}
          <div
            class="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-3 shadow-sm transition-all hover:border-gray-300 hover:shadow-md"
          >
            <div class="flex items-start justify-between">
              <div class="flex flex-1 items-center gap-2 pl-0.5 pt-0.5">
                <span class="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                  {translate('signature.placeSignature', { fallback: 'Signature' })}
                </span>
                {#if showInitials && entry.initials}
                  <span class="text-[10px] text-gray-300">•</span>
                  <span class="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                    {translate('signature.placeInitials', { fallback: 'Initials' })}
                  </span>
                {/if}
              </div>

              <button
                class="-mr-1 -mt-1 flex rounded p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                onclick={(e) => handleRemove(e, entry.id)}
                title={translate('signature.remove', { fallback: 'Remove signature' })}
              >
                <TrashIcon class="h-3.5 w-3.5" />
              </button>
            </div>

            <div class="flex gap-3">
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="flex h-16 cursor-pointer items-center justify-center rounded-md border border-dashed transition-all {showInitials &&
                entry.initials
                  ? 'flex-[2]'
                  : 'flex-1'} {isActive(entry.id, SignatureFieldKind.Signature)
                  ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500 ring-offset-1'
                  : 'border-gray-200 hover:border-gray-400 hover:bg-gray-50'}"
                onclick={() => handlePlaceSignature(entry.id)}
              >
                <img
                  src={entry.signature.previewDataUrl}
                  class="h-12 max-w-[90%] object-contain"
                  alt="Signature"
                />
              </div>

              {#if showInitials && entry.initials}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                  class="flex h-16 flex-1 cursor-pointer items-center justify-center rounded-md border border-dashed transition-all {isActive(
                    entry.id,
                    SignatureFieldKind.Initials,
                  )
                    ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500 ring-offset-1'
                    : 'border-gray-200 hover:border-gray-400 hover:bg-gray-50'}"
                  onclick={() => handlePlaceInitials(entry.id)}
                >
                  <img
                    src={entry.initials.previewDataUrl}
                    class="h-10 max-w-[80%] object-contain"
                    alt="Initials"
                  />
                </div>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </div>
  {:else}
    <div class="mt-8 flex flex-col items-center gap-2 p-4 text-gray-400">
      <SignatureIcon class="h-18 w-18 opacity-50" />
      <div class="max-w-[180px] text-center text-sm">
        {translate('signature.emptyState', {
          fallback: 'No signatures yet. Create one to get started.',
        })}
      </div>
    </div>
  {/if}
</div>
