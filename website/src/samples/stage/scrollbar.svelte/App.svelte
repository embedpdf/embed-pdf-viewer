<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { Scrollbar, Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { localEngine } from '@embedpdf/engine';
  import ReadingProgress from './ReadingProgress.svelte';

  import '../scrollbar.css';

  const engine = localEngine();
  const plugins = [stagePlugin(), renderPlugin()];

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
    <ReadingProgress />
    <Stage class="stage">
      <RenderLayer />
      {#snippet overlay()}
        <Scrollbar axis="y" autoHide={1200} class="scrollbar" thumbClass="thumb" />
      {/snippet}
    </Stage>
  </DocumentGate>
</Viewer>
