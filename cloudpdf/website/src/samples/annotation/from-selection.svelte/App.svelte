<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { interactionPlugin } from '@embedpdf/svelte/interaction';
  import { SelectionLayer, selectionPlugin } from '@embedpdf/svelte/selection';
  import { AnnotationLayer, annotationPlugin } from '@embedpdf/svelte/annotation';
  import { cloudEngine } from '@cloudpdf/engine';
  import MarkupToolbar from './MarkupToolbar.svelte';

  import '../from-selection.css';

  const engine = cloudEngine();
  const plugins = [
    stagePlugin(),
    renderPlugin(),
    interactionPlugin(),
    selectionPlugin(),
    annotationPlugin(),
  ];

  const article: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: article }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <MarkupToolbar />
    <Stage class="stage">
      <RenderLayer />
      <SelectionLayer />
      <AnnotationLayer />
    </Stage>
  </DocumentGate>
</Viewer>
