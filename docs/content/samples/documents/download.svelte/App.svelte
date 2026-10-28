<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { localEngine } from '@embedpdf/engine';
  import DownloadBar from './DownloadBar.svelte';

  import '../download.css';

  const engine = localEngine();
  const plugins = [stagePlugin(), renderPlugin()];

  // [!doc-source welcome]
  const welcome = async (): Promise<OpenInput> => {
    const response = await fetch('/pdfs/welcome.pdf');
    return { kind: 'bytes', bytes: new Uint8Array(await response.arrayBuffer()) };
  };
  // [!/doc-source]
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: welcome, name: 'welcome.pdf' }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Opening…</p>
    {/snippet}
    <DownloadBar />
    <Stage class="stage">
      <RenderLayer />
    </Stage>
  </DocumentGate>
</Viewer>
