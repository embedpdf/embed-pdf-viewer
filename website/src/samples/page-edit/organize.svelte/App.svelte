<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { pageEditPlugin } from '@embedpdf/svelte/page-edit';
  import { renderPlugin } from '@embedpdf/svelte/render';
  import { localEngine } from '@embedpdf/engine';
  import PageOrganizer from './PageOrganizer.svelte';

  import '../organize.css';

  const engine = localEngine();
  const plugins = [renderPlugin(), pageEditPlugin()];

  const welcome = async (): Promise<OpenInput> => {
    const response = await fetch('/pdfs/embedpdf-welcome.pdf');
    return { kind: 'bytes', id: 'welcome', bytes: new Uint8Array(await response.arrayBuffer()) };
  };
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: welcome }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <PageOrganizer />
  </DocumentGate>
</Viewer>
