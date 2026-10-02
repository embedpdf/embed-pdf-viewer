<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { metadataPlugin } from '@embedpdf/svelte/metadata';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { localEngine } from '@embedpdf/engine';
  import LayerBar from './LayerBar.svelte';

  import '../layer.css';

  const engine = localEngine();
  const plugins = [stagePlugin(), renderPlugin(), metadataPlugin()];

  // The original stays as it is: the document opens with a layer over it, and the changes go there.
  const withLayer = async (layer?: Uint8Array): Promise<OpenInput> => {
    const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
    return {
      kind: 'layerBytes',
      baseBytes: new Uint8Array(await response.arrayBuffer()),
      layer: layer ? { kind: 'artifact', bytes: layer } : { kind: 'fresh' },
    };
  };
</script>

<script lang="ts">
  let reopened = $state(false);
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: () => withLayer(), name: 'ebook.pdf' }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Opening…</p>
    {/snippet}
    <LayerBar {withLayer} {reopened} onReopened={() => (reopened = true)} />
    <Stage class="stage">
      <RenderLayer />
    </Stage>
  </DocumentGate>
</Viewer>
