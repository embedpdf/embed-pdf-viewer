<script lang="ts">
  import { useOpenDocuments } from '@embedpdf/plugin-document-manager/svelte';
  import { FileText, X, Plus } from 'lucide-svelte';

  interface Props {
    documentIds: string[];
    activeDocumentId: string | null;
    canRemoveView: boolean;
    onSelect: (docId: string) => void;
    onRemoveDocument: (docId: string) => void;
    onOpenFile: () => void;
    onRemoveView: () => void;
  }

  let {
    documentIds,
    activeDocumentId,
    canRemoveView,
    onSelect,
    onRemoveDocument,
    onOpenFile,
    onRemoveView,
  }: Props = $props();

  const documentStates = useOpenDocuments(() => documentIds);

  const handleSelect = (e: Event, docId: string) => {
    e.stopPropagation();
    onSelect(docId);
  };

  const handleRemoveDoc = (e: Event, docId: string) => {
    e.stopPropagation();
    onRemoveDocument(docId);
  };

  const handleOpenFile = (e: Event) => {
    e.stopPropagation();
    onOpenFile();
  };

  const handleRemoveView = (e: Event) => {
    e.stopPropagation();
    onRemoveView();
  };
</script>

<div
  class="flex min-h-[36px] items-center gap-1 border-b border-gray-300 bg-gray-50 px-1 py-1 dark:border-gray-700 dark:bg-gray-800/50"
>
  <!-- Document Tabs -->
  <div class="flex flex-1 items-center gap-0.5 overflow-x-auto" role="tablist">
    {#each documentStates.current as doc (doc.id)}
      <div
        onclick={(e) => handleSelect(e, doc.id)}
        onkeydown={(e) => e.key === 'Enter' && handleSelect(e, doc.id)}
        role="tab"
        tabindex={0}
        aria-selected={activeDocumentId === doc.id}
        class={[
          'group flex min-w-0 max-w-[120px] cursor-pointer items-center gap-1.5 rounded px-2 py-1 text-[11px] font-medium transition-all',
          activeDocumentId === doc.id
            ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-300 dark:bg-gray-700 dark:text-gray-100 dark:ring-gray-600'
            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700/50 dark:hover:text-gray-300',
        ].join(' ')}
      >
        <FileText size={12} class="flex-shrink-0" />
        <span class="truncate">{doc.name || 'Untitled'}</span>
        <button
          type="button"
          onclick={(e) => handleRemoveDoc(e, doc.id)}
          class={[
            'flex-shrink-0 rounded p-0.5 transition-all hover:bg-gray-200 dark:hover:bg-gray-600',
            activeDocumentId === doc.id
              ? 'opacity-60 hover:opacity-100'
              : 'opacity-0 hover:!opacity-100 group-hover:opacity-60',
          ].join(' ')}
        >
          <X size={10} />
        </button>
      </div>
    {/each}

    {#if documentStates.current.length === 0}
      <span class="px-2 py-1 text-[11px] italic text-gray-500 dark:text-gray-400">
        Empty pane
      </span>
    {/if}
  </div>

  <!-- Actions -->
  <div class="ml-1 flex flex-shrink-0 items-center gap-0.5">
    <button
      type="button"
      onclick={handleOpenFile}
      class="rounded p-1 text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-600 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-300"
      title="Open file in this pane"
    >
      <Plus size={14} />
    </button>
    {#if canRemoveView}
      <button
        type="button"
        onclick={handleRemoveView}
        class="rounded p-1 text-gray-500 transition-colors hover:bg-red-100 hover:text-red-600 dark:text-gray-400 dark:hover:bg-red-900/30 dark:hover:text-red-400"
        title="Close this pane"
      >
        <X size={14} />
      </button>
    {/if}
  </div>
</div>
