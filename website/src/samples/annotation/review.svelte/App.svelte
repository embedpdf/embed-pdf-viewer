<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { SelectionLayer, selectionPlugin } from '@embedpdf/svelte/selection';
  import { interactionPlugin } from '@embedpdf/svelte/interaction';
  import { AnnotationLayer, annotationPlugin } from '@embedpdf/svelte/annotation';
  import { localEngine } from '@embedpdf/engine';
  import Reviews from './Reviews.svelte';

  import '../review.css';

  const engine = localEngine();
  const plugins = [
    stagePlugin(),
    renderPlugin(),
    interactionPlugin(),
    selectionPlugin(),
    annotationPlugin(),
  ];

  const proposal = async (): Promise<OpenInput> => {
    const response = await fetch('/pdfs/proposal.pdf');
    return { kind: 'bytes', id: 'proposal', bytes: new Uint8Array(await response.arrayBuffer()) };
  };
</script>

<Viewer
  {engine}
  {plugins}
  identity={{ userId: 'u_381', displayName: 'Dana Smith' }}
  initialDocuments={[{ source: proposal }]}
>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <div class="viewer">
      <Stage class="stage">
        <RenderLayer />
        <SelectionLayer />
        <AnnotationLayer />
      </Stage>
      <Reviews />
    </div>
  </DocumentGate>
</Viewer>
