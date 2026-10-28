<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { interactionPlugin } from '@embedpdf/svelte/interaction';
  import { AnnotationLayer, annotationPlugin } from '@embedpdf/svelte/annotation';
  import { FormLayer, formPlugin } from '@embedpdf/svelte/form';
  import { cloudEngine } from '@cloudpdf/engine';
  import FieldPalette from './FieldPalette.svelte';

  import '../designer.css';

  const engine = cloudEngine();
  // Building forms needs the annotation plugin: in design mode, fields are boxes like any annotation.
  const plugins = [
    stagePlugin(),
    renderPlugin(),
    interactionPlugin(),
    annotationPlugin(),
    formPlugin(),
  ];

  const registration: OpenInput = { kind: 'share', shareToken: 'shr_sjOrUrwF2Sf0X5ADfySRG58L' };
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: registration }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <FieldPalette />
    <Stage class="stage">
      <RenderLayer />
      <AnnotationLayer />
      <FormLayer />
    </Stage>
  </DocumentGate>
</Viewer>
