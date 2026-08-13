<script lang="ts">
  import { onMount } from 'svelte';
  import { localEngine } from '@embedpdf/engine';
  import type { DocumentHandle, OpenInput } from '@embedpdf/engine';
  import PdfPage from './PdfPage.svelte';

  // The Svelte adapter is in progress — this drives the framework-free engine
  // directly: App owns the engine and the document, PdfPage renders one page.
  let doc = $state<DocumentHandle>();

  // The engine is created synchronously and costs nothing until first use —
  // only opening a document does real work.
  const engine = localEngine();

  onMount(async () => {
    // The local engine opens bytes — fetch the sample and hand them over.
    const ebook: OpenInput = await fetch('https://snippet.embedpdf.com/ebook.pdf')
      .then((response) => response.arrayBuffer())
      .then((buffer) => ({ kind: 'bytes', id: 'ebook', bytes: new Uint8Array(buffer) }));
    doc = await engine.open(ebook);
  });
</script>

{#if doc}
  <PdfPage {doc} pageNumber={1} />
{:else}
  <p>Opening document…</p>
{/if}
