<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { localEngine } from '@embedpdf/engine';

  import './page-labels.css';

  const engine = localEngine();

  // Reserve a 26px band below every page: the label lives there, so it never
  // covers the page and keeps its size when you zoom.
  const plugins = [stagePlugin({ pageFrame: { bottom: 26 } }), renderPlugin()];

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
    <Stage class="stage">
      <RenderLayer />
      {#snippet pageChrome(page)}
        <div class="page-label" style:height="{page.frame.bottom}px">
          Page {page.pageIndex + 1}
        </div>
      {/snippet}
    </Stage>
  </DocumentGate>
</Viewer>
