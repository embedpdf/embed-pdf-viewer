<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { pageEditPlugin } from '@embedpdf/svelte/page-edit';
  import { renderPlugin } from '@embedpdf/svelte/render';
  import { localEngine } from '@embedpdf/engine';
  import PageOrganizer from './PageOrganizer.svelte';

  import '../organize.css';

  const engine = localEngine();
  const plugins = [renderPlugin(), pageEditPlugin()];

  // [!doc-source ebook]
  const ebook = async (): Promise<OpenInput> => {
    const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
    return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
  };
  // [!/doc-source]
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: ebook }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <PageOrganizer />
  </DocumentGate>
</Viewer>
