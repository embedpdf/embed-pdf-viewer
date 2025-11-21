<script lang="ts">
  import type { DocumentState } from '@embedpdf/core';
  import { useViewManagerCapability, useAllViews } from '@embedpdf/plugin-view-manager/svelte';

  interface TabContextMenuProps {
    documentState: DocumentState;
    currentViewId: string;
    position: { x: number; y: number };
    onClose: () => void;
  }

  let { documentState, currentViewId, position, onClose }: TabContextMenuProps = $props();

  let menuRef = $state<HTMLDivElement | null>(null);

  const viewManagerCapability = useViewManagerCapability();
  const allViews = useAllViews();

  $effect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef && !menuRef.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  });

  const handleOpenInNewView = () => {
    if (!viewManagerCapability.provides) return;

    const newViewId = viewManagerCapability.provides.createView();
    viewManagerCapability.provides.addDocumentToView(newViewId, documentState.id);
    viewManagerCapability.provides.removeDocumentFromView(currentViewId, documentState.id);
    viewManagerCapability.provides.setFocusedView(newViewId);
    onClose();
  };

  const handleMoveToView = (targetViewId: string) => {
    if (!viewManagerCapability.provides) return;
    viewManagerCapability.provides.moveDocumentBetweenViews(
      currentViewId,
      targetViewId,
      documentState.id,
    );
    viewManagerCapability.provides.setFocusedView(targetViewId);
    viewManagerCapability.provides.setViewActiveDocument(targetViewId, documentState.id);
    onClose();
  };

  const otherViews = $derived(allViews.current.filter((v) => v.id !== currentViewId));
</script>

<div
  bind:this={menuRef}
  class="fixed z-50 w-48 rounded-md border border-gray-200 bg-white shadow-lg"
  style="left: {position.x}px; top: {position.y}px;"
>
  <div class="py-1">
    <button
      onclick={handleOpenInNewView}
      class="w-full px-4 py-2 text-left text-sm hover:bg-gray-100"
    >
      Open in New View
    </button>

    {#if otherViews.length > 0}
      <div class="my-1 border-t border-gray-200"></div>
      <div class="px-4 py-1 text-xs font-semibold text-gray-500">Move to View</div>
      {#each otherViews as view, index (view.id)}
        <button
          onclick={() => handleMoveToView(view.id)}
          class="w-full px-4 py-2 text-left text-sm hover:bg-gray-100"
        >
          View {index + 2} ({view.documentIds.length} docs)
        </button>
      {/each}
    {/if}
  </div>
</div>
