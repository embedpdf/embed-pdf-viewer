<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { localEngine } from '@embedpdf/engine';
  import ZoomBar from './ZoomBar.svelte';

  import '../deep-zoom.css';

  const engine = localEngine();
  // Open at 250%: past what a whole-page picture shows sharply, so tiles carry it.
  const plugins = [stagePlugin({ zoom: { level: 2.5 } }), renderPlugin()];

  const ebook = async (): Promise<OpenInput> => {
    const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
    return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
  };
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: ebook }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <ZoomBar />
    <Stage class="stage">
      <RenderLayer />
    </Stage>
  </DocumentGate>
</Viewer>
