<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { localEngine } from '@embedpdf/engine';
  import DownloadAnyway from './DownloadAnyway.svelte';

  import '../refused.css';

  const engine = localEngine();
  const plugins = [stagePlugin(), renderPlugin()];

  // [!doc-source welcome]
  const welcome = async (): Promise<OpenInput> => {
    const response = await fetch('/pdfs/welcome.pdf');
    return { kind: 'bytes', bytes: new Uint8Array(await response.arrayBuffer()) };
  };
  // [!/doc-source]

  // Read and select, but no downloading.
  const scope = ['doc.open', 'doc.render', 'doc.text.select'];
</script>

<Viewer {engine} {plugins} {scope} initialDocuments={[{ source: welcome }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Opening…</p>
    {/snippet}
    <DownloadAnyway />
    <Stage class="stage">
      <RenderLayer />
    </Stage>
  </DocumentGate>
</Viewer>
