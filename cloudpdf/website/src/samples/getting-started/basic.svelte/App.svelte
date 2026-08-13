<script lang="ts">
  import { onMount } from 'svelte';
  import { cloudEngine } from '@cloudpdf/engine';
  import type { DocumentHandle, OpenInput } from '@cloudpdf/engine';
  import PdfPage from './PdfPage.svelte';

  // The Svelte adapter is in progress — this drives the framework-free engine
  // directly: App owns the engine and the document, PdfPage renders one page.
  let doc = $state<DocumentHandle>();

  // The engine is created synchronously and costs nothing until first use —
  // only opening a document does real work.
  const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });

  onMount(async () => {
    const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };
    doc = await engine.open(ebook);
  });
</script>

{#if doc}
  <PdfPage {doc} pageNumber={1} />
{:else}
  <p>Opening document…</p>
{/if}
