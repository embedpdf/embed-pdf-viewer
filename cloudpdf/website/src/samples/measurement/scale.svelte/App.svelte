<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { interactionPlugin } from '@embedpdf/svelte/interaction';
  import { AnnotationLayer, annotationPlugin } from '@embedpdf/svelte/annotation';
  import { measurementPlugin } from '@embedpdf/svelte/measurement';
  import { cloudEngine } from '@cloudpdf/engine';
  import MeasurePlan from './MeasurePlan.svelte';
  import ScaleToolbar from './ScaleToolbar.svelte';

  import '../scale.css';

  const engine = cloudEngine();
  const plugins = [
    stagePlugin(),
    renderPlugin(),
    interactionPlugin(),
    annotationPlugin(),
    measurementPlugin(),
  ];

  const sketch: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: sketch }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <MeasurePlan />
    <ScaleToolbar />
    <Stage class="stage">
      <RenderLayer />
      <AnnotationLayer />
    </Stage>
  </DocumentGate>
</Viewer>
