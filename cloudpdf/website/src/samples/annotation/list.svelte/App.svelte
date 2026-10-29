<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { SelectionLayer, selectionPlugin } from '@embedpdf/svelte/selection';
  import { interactionPlugin } from '@embedpdf/svelte/interaction';
  import { AnnotationLayer, annotationPlugin } from '@embedpdf/svelte/annotation';
  import { cloudEngine } from '@cloudpdf/engine';
  import AnnotationList from './AnnotationList.svelte';

  import '../list.css';

  const engine = cloudEngine();
  const plugins = [
    stagePlugin(),
    renderPlugin(),
    interactionPlugin(),
    selectionPlugin(),
    annotationPlugin(),
  ];

  const proposal: OpenInput = { kind: 'grant', grant: 'shr_qnqHtCNRpzz-s7DPFBIbuOAF' };
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: proposal }]}>
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
      <AnnotationList />
    </div>
  </DocumentGate>
</Viewer>
