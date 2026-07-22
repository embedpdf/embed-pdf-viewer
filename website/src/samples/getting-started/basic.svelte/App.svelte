<script lang="ts">
  import { onMount } from 'svelte';
  import type { LocalEngine } from '@embedpdf/engine';
  import PdfPage from './PdfPage.svelte';

  // The Svelte adapter is in progress — this drives the framework-free engine
  // directly: App owns the engine and the document, PdfPage renders one page.
  type PdfDocument = Awaited<ReturnType<LocalEngine['open']>>;

  let doc = $state<PdfDocument>();
  let status = $state('Booting engine…');

  onMount(async () => {
    // `localEngine()` IS the engine — no worker wiring needed; PDFium boots in
    // a worker on first use. The Svelte adapter will own this for you.
    const { localEngine } = await import('@embedpdf/engine');
    const engine = localEngine();

    status = 'Opening document…';
    const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
    const bytes = new Uint8Array(await response.arrayBuffer());
    doc = await engine.open({ kind: 'bytes', id: 'ebook', bytes });
  });
</script>

{#if doc}
  <PdfPage {doc} pageNumber={1} />
{:else}
  <p>{status}</p>
{/if}
