<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { interactionPlugin } from '@embedpdf/svelte/interaction';
  import { AnnotationLayer, annotationPlugin } from '@embedpdf/svelte/annotation';
  import { localEngine } from '@embedpdf/engine';
  import Authors from './Authors.svelte';
  import Toolbar from './Toolbar.svelte';

  import '../identity.css';

  const engine = localEngine();
  const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), annotationPlugin()];

  // [!doc-source sketch]
  const sketch = async (): Promise<OpenInput> => {
    const response = await fetch('/pdfs/embedpdf-sketch.pdf');
    return { kind: 'bytes', id: 'sketch', bytes: new Uint8Array(await response.arrayBuffer()) };
  };
  // [!/doc-source]
</script>

<Viewer
  {engine}
  {plugins}
  identity={{ userId: 'u_381', displayName: 'Dana Smith' }}
  initialDocuments={[{ source: sketch }]}
>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <Toolbar />
    <div class="viewer">
      <Stage class="stage">
        <RenderLayer />
        <AnnotationLayer />
      </Stage>
      <Authors />
    </div>
  </DocumentGate>
</Viewer>
