<script lang="ts">
  import { DocumentGate, DocumentScope, useDocumentsState } from '@embedpdf/svelte/runtime';
  import { RenderLayer } from '@embedpdf/svelte/render';
  import { Stage } from '@embedpdf/svelte/stage';
  import {
    useViewManager,
    useViewManagerState,
    type PaneInfo,
  } from '@embedpdf/svelte/view-manager';

  let { pane, canRemove }: { pane: PaneInfo; canRemove: boolean } = $props();

  const views = useViewManager();
  const focusedPaneId = useViewManagerState((state) => state.focusedPaneId);
  const open = useDocumentsState();
  const nameOf = (id: string) => open.documents.find((document) => document.id === id)?.name ?? id;

  function split() {
    if (pane.activeDocumentId) views.splitPane(pane.activeDocumentId, { from: pane.id });
  }
</script>

<section
  class="pane"
  aria-label="Document pane"
  data-focused={pane.id === focusedPaneId.current}
  onpointerdown={() => views.setFocusedPane(pane.id)}
>
  <div class="bar" role="tablist">
    {#each pane.documentIds as id (id)}
      <button
        type="button"
        role="tab"
        class="tab"
        aria-selected={id === pane.activeDocumentId}
        onclick={() => views.setActiveDocument(pane.id, id)}
      >
        {nameOf(id)}
      </button>
    {/each}
    <button
      type="button"
      class="button"
      disabled={!pane.activeDocumentId || pane.documentIds.length < 2}
      onclick={split}
    >
      Split
    </button>
    <button
      type="button"
      class="button"
      disabled={!canRemove}
      onclick={() => views.removePane(pane.id)}
    >
      Close pane
    </button>
  </div>
  {#if pane.activeDocumentId}
    <DocumentScope id={pane.activeDocumentId}>
      <DocumentGate>
        {#snippet fallback()}
          <p class="empty">Opening…</p>
        {/snippet}
        <Stage class="stage">
          <RenderLayer />
        </Stage>
      </DocumentGate>
    </DocumentScope>
  {:else}
    <p class="empty">No document in this pane.</p>
  {/if}
</section>
