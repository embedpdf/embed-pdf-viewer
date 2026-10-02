<script lang="ts">
  import { onMount } from 'svelte';
  import { saveFile, useDocument, useDocuments } from '@embedpdf/svelte/runtime';
  import { useMetadata, useMetadataState } from '@embedpdf/svelte/metadata';

  const documents = useDocuments();
  const metadata = useMetadata();
  const title = useMetadataState((fields) => fields.metadata?.title ?? '');
  const document = useDocument();

  // A change on load: the document gets a new title, so it has something to lose.
  onMount(() => {
    void metadata.update({ title: 'Quarterly report (draft)' });
  });

  // While there's something to lose, the browser asks before the page closes.
  $effect(() => {
    if (!document.hasUnsavedChanges) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  });

  async function download() {
    saveFile(await documents.download(), 'report.pdf');
  }
</script>

<div class="toolbar">
  <input
    class="field"
    aria-label="Title"
    value={title.current}
    onblur={(event) => metadata.update({ title: event.currentTarget.value })}
  />
  <span class="badge" data-unsaved={document.hasUnsavedChanges}>
    {document.hasUnsavedChanges ? 'Unsaved changes' : 'Downloaded'}
  </span>
  <button type="button" class="button" onclick={download}>Download</button>
</div>
