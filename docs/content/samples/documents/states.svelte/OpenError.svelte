<script lang="ts">
  import { useDocuments, type FailedDocumentInfo } from '@embedpdf/svelte/runtime';

  let { document }: { document: FailedDocumentInfo } = $props();

  const documents = useDocuments();
</script>

<div class="panel" data-tone="error">
  <h3>Couldn’t open {document.name}</h3>
  <p>{document.error.message}</p>
  <div class="actions">
    <button type="button" class="button" onclick={() => documents.retry(document.id)}>
      Try again
    </button>
    <button type="button" class="button" onclick={() => documents.close(document.id)}>Close</button>
  </div>
</div>
