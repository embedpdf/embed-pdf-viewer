<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { interactionPlugin } from '@embedpdf/svelte/interaction';
  import { AnnotationLayer, annotationPlugin } from '@embedpdf/svelte/annotation';
  import { localEngine } from '@embedpdf/engine';
  import AddRectangles from './AddRectangles.svelte';
  import OrderControls from './OrderControls.svelte';

  import '../order.css';

  const engine = localEngine();
  const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), annotationPlugin()];

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
    <AddRectangles />
    <OrderControls />
    <Stage class="stage">
      <RenderLayer />
      <AnnotationLayer />
    </Stage>
  </DocumentGate>
</Viewer>
