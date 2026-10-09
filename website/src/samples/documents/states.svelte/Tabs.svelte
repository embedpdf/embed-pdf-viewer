<script lang="ts">
  import { useDocuments, useDocumentsState } from '@embedpdf/svelte/runtime';

  const documents = useDocuments();
  const tabs = useDocumentsState();
</script>

<div class="tabs" role="tablist">
  {#each tabs.documents as document (document.id)}
    <button
      type="button"
      role="tab"
      class="tab"
      aria-selected={document.id === tabs.activeId}
      onclick={() => documents.setActive(document.id)}
    >
      <span class="status" data-status={document.status}></span>
      {document.name}
    </button>
  {/each}
</div>
