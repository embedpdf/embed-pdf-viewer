<script lang="ts">
  import { useDocuments, useDocumentsState } from '@embedpdf/svelte/runtime';

  const documents = useDocuments();
  const state = useDocumentsState();
</script>

<div role="tablist">
  {#each state.documents as document (document.id)}
    <div>
      <button
        role="tab"
        aria-selected={document.id === state.activeId}
        onclick={() => documents.setActive(document.id)}
      >
        {document.name}
      </button>
      <button aria-label="Close {document.name}" onclick={() => documents.close(document.id)}>×</button>
    </div>
  {/each}
</div>
