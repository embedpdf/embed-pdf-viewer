<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { interactionPlugin } from '@embedpdf/svelte/interaction';
  import { SelectionLayer, selectionPlugin } from '@embedpdf/svelte/selection';
  import { searchPlugin } from '@embedpdf/svelte/search';
  import { AnnotationLayer, annotationPlugin } from '@embedpdf/svelte/annotation';
  import { redactionPlugin } from '@embedpdf/svelte/redaction';
  import { cloudEngine } from '@cloudpdf/engine';
  import MarkFromCode from './MarkFromCode.svelte';

  import '../from-code.css';

  const engine = cloudEngine();
  // Marking matches runs a search; marking the selected text needs a selection.
  const plugins = [
    stagePlugin(),
    renderPlugin(),
    interactionPlugin(),
    selectionPlugin(),
    searchPlugin(),
    annotationPlugin(),
    redactionPlugin(),
  ];

  const welcome: OpenInput = { kind: 'share', shareToken: 'shr_gvpJcG1ULUMon19C0D1wODSY' };
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: welcome }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <MarkFromCode />
    <Stage class="stage">
      <RenderLayer />
      <SelectionLayer />
      <AnnotationLayer />
    </Stage>
  </DocumentGate>
</Viewer>
