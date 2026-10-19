<script lang="ts">
  import { useDocument, useDocuments, type OpenSource } from '@embedpdf/svelte/runtime';

  let { ebook }: { ebook: OpenSource } = $props();

  const documents = useDocuments();
  const document = useDocument();

  // A file the user picks opens next to the ebook, and becomes the active document.
  async function openFile(file: File) {
    await documents.open({ kind: 'bytes', bytes: await file.arrayBuffer() }, { name: file.name });
  }
</script>

<div class="toolbar">
  <span class="document">
    {#if document.id}
      <strong>{document.name ?? 'Untitled'}</strong>
      {document.status === 'ready' ? ` · ${document.pageCount} pages` : ` · ${document.status}`}
    {:else}
      No document open
    {/if}
  </span>
  <label class="button picker">
    Open a PDF…
    <input
      type="file"
      accept="application/pdf"
      onchange={(event) => {
        const file = event.currentTarget.files?.[0];
        if (file) void openFile(file);
        event.currentTarget.value = '';
      }}
    />
  </label>
  {#if document.id}
    <button type="button" class="button" onclick={() => documents.close(document.id)}>Close</button>
  {:else}
    <button
      type="button"
      class="button"
      onclick={() => documents.open(ebook, { name: 'ebook.pdf' })}
    >
      Open the ebook again
    </button>
  {/if}
</div>
