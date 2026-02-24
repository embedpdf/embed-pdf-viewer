<script lang="ts">
  import type { View } from '@embedpdf/plugin-view-manager';
  import type { DocumentState } from '@embedpdf/core';
  import { useOpenDocuments } from '@embedpdf/plugin-document-manager/svelte';
  import DocumentIcon from './icons/DocumentIcon.svelte';
  import CloseIcon from './icons/CloseIcon.svelte';
  import PlusIcon from './icons/PlusIcon.svelte';
  import TabContextMenu from './TabContextMenu.svelte';

  interface TabBarViewManagerProps {
    currentView: View | undefined;
    onSelect: (documentId: string) => void;
    onClose: (documentId: string) => void;
    onOpenFile: () => void;
  }

  let { currentView, onSelect, onClose, onOpenFile }: TabBarViewManagerProps = $props();

  const documentStates = useOpenDocuments(() => currentView?.documentIds ?? []);

  let contextMenu = $state<{
    documentState: DocumentState;
    position: { x: number; y: number };
  } | null>(null);

  const handleKeyDown = (e: KeyboardEvent, documentId: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(documentId);
    }
  };

  const handleContextMenu = (e: MouseEvent, documentState: DocumentState) => {
    e.preventDefault();
    contextMenu = {
      documentState,
      position: { x: e.clientX, y: e.clientY },
    };
  };
</script>

<div class="flex items-end gap-0.5 bg-gray-100 px-2 pt-2">
  <!-- Document Tabs -->
  <div class="flex flex-1 items-end gap-0.5 overflow-x-auto">
    {#each documentStates.current as doc (doc.id)}
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <div
        onclick={() => onSelect(doc.id)}
        oncontextmenu={(e) => handleContextMenu(e, doc)}
        onkeydown={(e) => handleKeyDown(e, doc.id)}
        role="tab"
        tabindex={0}
        aria-selected={doc.id === currentView?.activeDocumentId}
        class="group relative flex min-w-[120px] max-w-[240px] cursor-pointer items-center gap-2 rounded-t-md px-3 py-2.5 text-sm font-medium transition-all {doc.id ===
        currentView?.activeDocumentId
          ? 'bg-white text-gray-900 shadow-[0_2px_4px_-1px_rgba(0,0,0,0.06)]'
          : 'bg-gray-200/60 text-gray-600 hover:bg-gray-200 hover:text-gray-800'}"
      >
        <!-- Document Icon -->
        <DocumentIcon class="h-4 w-4 flex-shrink-0" title="Document" />

        <!-- Document Name -->
        <span class="min-w-0 flex-1 truncate">
          {doc.name || 'Untitled'}
        </span>

        <!-- Close Button -->
        <button
          onclick={(e) => {
            e.stopPropagation();
            onClose(doc.id);
          }}
          aria-label="Close {doc.name || 'document'}"
          class="flex-shrink-0 cursor-pointer rounded-full p-1 transition-all hover:bg-gray-300/50 {doc.id ===
          currentView?.activeDocumentId
            ? 'opacity-100'
            : 'opacity-0 group-hover:opacity-100'}"
        >
          <CloseIcon class="h-3.5 w-3.5" title="Close" />
        </button>
      </div>
    {/each}

    <!-- Add Tab (Open File) -->
    <button
      onclick={onOpenFile}
      class="mb-2 ml-1 flex-shrink-0 cursor-pointer rounded p-1.5 text-gray-600 transition-colors hover:bg-gray-200/80 hover:text-gray-800"
      aria-label="Open File"
      title="Open File"
    >
      <PlusIcon class="h-3.5 w-3.5" title="Open File" />
    </button>
  </div>
</div>

<!-- Context Menu -->
{#if contextMenu && currentView}
  <TabContextMenu
    documentState={contextMenu.documentState}
    currentViewId={currentView.id}
    position={contextMenu.position}
    onClose={() => (contextMenu = null)}
  />
{/if}
