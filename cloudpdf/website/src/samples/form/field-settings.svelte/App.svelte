<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { interactionPlugin } from '@embedpdf/svelte/interaction';
  import { AnnotationLayer, annotationPlugin } from '@embedpdf/svelte/annotation';
  import { FormLayer, formPlugin } from '@embedpdf/svelte/form';
  import { cloudEngine } from '@cloudpdf/engine';
  import FieldSettings from './FieldSettings.svelte';

  import '../field-settings.css';

  const engine = cloudEngine();
  const plugins = [
    stagePlugin(),
    renderPlugin(),
    interactionPlugin(),
    annotationPlugin(),
    formPlugin(),
  ];

  const forms: OpenInput = { kind: 'share', shareToken: 'shr_eBRW5E3MpolzD8G36Alp30EF' };
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: forms }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <div class="viewer">
      <Stage class="stage">
        <RenderLayer />
        <AnnotationLayer />
        <FormLayer />
      </Stage>
      <FieldSettings />
    </div>
  </DocumentGate>
</Viewer>
