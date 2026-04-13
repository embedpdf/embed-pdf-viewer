<script lang="ts">
  import { useTranslations } from '@embedpdf/plugin-i18n/svelte';
  import {
    useStampLibraries,
    useStampsByLibrary,
    useStampCapability,
    useActiveStamp,
    StampImg,
  } from '@embedpdf/plugin-stamp/svelte';
  import type { StampDefinition } from '@embedpdf/plugin-stamp/svelte';
  import { ignore } from '@embedpdf/models';
  import { DownloadIcon, CloseIcon, RubberStampIcon } from './icons';

  const STAMP_THUMB_WIDTH = 120;

  interface Props {
    documentId: string;
    selectedLibraryId?: string;
  }

  let { documentId, selectedLibraryId: propLibraryId }: Props = $props();

  const { translate } = useTranslations(() => documentId);
  const stampCapability = useStampCapability();
  const stampLibraries = useStampLibraries();
  let internalLibraryId = $state<string | null>(null);
  const selectedLibraryId = $derived(internalLibraryId ?? propLibraryId ?? 'all');
  const stampsByLibrary = useStampsByLibrary(
    () => selectedLibraryId,
    () => 'sidebar',
  );
  const activeStampState = useActiveStamp(() => documentId);

  const handleStampClick = (libraryId: string, stamp: StampDefinition) => {
    if (!stampCapability.provides) return;
    stampCapability.provides.forDocument(documentId).activateStampPlacement(libraryId, stamp);
  };

  const handleRemoveStamp = (e: Event, libraryId: string, stampId: string) => {
    e.stopPropagation();
    if (!stampCapability.provides) return;
    stampCapability.provides.removeStampFromLibrary(libraryId, stampId).wait(() => {}, ignore);
  };

  const handleExport = () => {
    if (!stampCapability.provides) return;
    const libraryIds = [...new Set(stampsByLibrary.stamps.map((s) => s.library.id))];
    for (const id of libraryIds) {
      stampCapability.provides.exportLibrary(id).wait((exported) => {
        const blob = new Blob([exported.pdf], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${exported.name}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      }, ignore);
    }
  };

  const resolveLibraryName = (lib: { name: string; nameKey?: string }) =>
    translate(lib.nameKey ?? '', { fallback: lib.name });
</script>

<div class="flex h-full flex-col">
  <div class="border-b border-gray-200 p-4">
    <div class="flex items-center justify-between">
      <h2 class="text-md font-medium text-gray-900">
        {translate('stamp.title', { fallback: 'Rubber Stamps' })}
      </h2>
      {#if stampsByLibrary.stamps.length > 0}
        <button
          class="rounded p-1 text-gray-400 transition-colors hover:text-gray-600"
          onclick={handleExport}
          title={translate('insert.rubberStamp.export', { fallback: 'Export Stamps' })}
        >
          <DownloadIcon class="h-4 w-4" />
        </button>
      {/if}
    </div>

    {#if stampLibraries.libraries.length > 1}
      <select
        class="mt-4 w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        value={selectedLibraryId}
        onchange={(e) => (internalLibraryId = (e.target as HTMLSelectElement).value)}
      >
        <option value="all">
          {translate('stamp.allStamps', { fallback: 'All Stamps' })}
        </option>
        {#each stampLibraries.libraries as lib (lib.id)}
          <option value={lib.id}>
            {resolveLibraryName(lib)}
          </option>
        {/each}
      </select>
    {/if}
  </div>

  {#if stampsByLibrary.stamps.length > 0}
    <div class="flex-1 overflow-y-auto p-4">
      <div class="grid grid-cols-2 gap-3">
        {#each stampsByLibrary.stamps as { library, stamp } (`${library.id}-${stamp.id}`)}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="group relative flex cursor-pointer items-center justify-center overflow-hidden rounded-md border transition-colors {activeStampState
              .activeStamp?.libraryId === library.id &&
            activeStampState.activeStamp?.stamp.id === stamp.id
              ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500'
              : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'}"
            style="aspect-ratio: 1"
            onclick={() => handleStampClick(library.id, stamp)}
          >
            <StampImg
              libraryId={library.id}
              pageIndex={stamp.pageIndex}
              width={STAMP_THUMB_WIDTH}
              style="max-width: 80%; max-height: 80%; object-fit: contain"
            />
            {#if !library.readonly}
              <button
                class="absolute right-1 top-1 flex rounded-full border border-gray-200 bg-white p-0.5 text-gray-400 opacity-0 shadow-sm transition-opacity hover:text-gray-600 group-hover:opacity-100"
                onclick={(e) => handleRemoveStamp(e, library.id, stamp.id)}
              >
                <CloseIcon class="h-3 w-3" />
              </button>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {:else}
    <div class="mt-8 flex flex-col items-center gap-2 p-4 text-gray-400">
      <RubberStampIcon class="h-18 w-18 text-gray-400" />
      <div class="max-w-[150px] text-center text-sm text-gray-400">
        {translate('stamp.emptyState', {
          fallback: 'No stamps found in the selected library.',
        })}
      </div>
    </div>
  {/if}
</div>
