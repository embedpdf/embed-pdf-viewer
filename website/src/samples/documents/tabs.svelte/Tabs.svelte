<script lang="ts">
  import { useDocuments, useDocumentsState, type OpenSource } from '@embedpdf/svelte/runtime';

  let { sketch }: { sketch: OpenSource } = $props();

  const documents = useDocuments();
  const tabs = useDocumentsState();
</script>

<div class="tabs" role="tablist">
  {#each tabs.documents as document (document.id)}
    <div class="tab" data-active={document.id === tabs.activeId}>
      <button
        type="button"
        role="tab"
        class="name"
        aria-selected={document.id === tabs.activeId}
        onclick={() => documents.setActive(document.id)}
      >
        {document.name}
      </button>
      <button
        type="button"
        class="close"
        aria-label="Close {document.name}"
        onclick={() => documents.close(document.id)}
      >
        ×
      </button>
    </div>
  {/each}
  <button
    type="button"
    class="button"
    aria-label="Open the floor plan"
    onclick={() => documents.open(sketch, { name: 'Floor plan' })}
  >
    +
  </button>
</div>
