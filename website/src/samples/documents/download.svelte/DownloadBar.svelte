<script lang="ts">
  import { onMount } from 'svelte';
  import { saveFile, useDocuments, type PdfSaveMode } from '@embedpdf/svelte/runtime';

  const documents = useDocuments();
  let mode = $state<PdfSaveMode>('incremental');
  let sizes = $state<Record<PdfSaveMode, string> | null>(null);

  const megabytes = (bytes: Uint8Array) => `${(bytes.byteLength / 1_000_000).toFixed(2)} MB`;

  // How big each kind of download is: the same document, written two ways.
  onMount(() => {
    const cancel = new AbortController();
    const { signal } = cancel;
    Promise.all([
      documents.download(undefined, { signal }),
      documents.download(undefined, { mode: 'rewrite', signal }),
    ])
      .then(([incremental, rewrite]) => {
        sizes = { incremental: megabytes(incremental), rewrite: megabytes(rewrite) };
      })
      .catch(() => {}); // cancelled: the example went away
    return () => cancel.abort();
  });

  async function download() {
    saveFile(await documents.download(undefined, { mode }), 'ebook.pdf');
  }
</script>

<div class="toolbar">
  <div class="segmented" role="group" aria-label="Kind of download">
    <button
      type="button"
      aria-pressed={mode === 'incremental'}
      onclick={() => (mode = 'incremental')}
    >
      Incremental
    </button>
    <button type="button" aria-pressed={mode === 'rewrite'} onclick={() => (mode = 'rewrite')}>
      Rewrite
    </button>
  </div>
  <button type="button" class="download" disabled={!documents.canDownload()} onclick={download}>
    Download
  </button>
  <output class="sizes">
    {#if sizes}
      Incremental <strong>{sizes.incremental}</strong> · Rewrite <strong>{sizes.rewrite}</strong>
    {:else}
      Measuring…
    {/if}
  </output>
</div>
