<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { SelectionLayer, selectionPlugin } from '@embedpdf/svelte/selection';
  import { interactionPlugin } from '@embedpdf/svelte/interaction';
  import { AnnotationLayer, annotationPlugin } from '@embedpdf/svelte/annotation';
  import { cloudEngine } from '@cloudpdf/engine';
  import ActivityLog from './ActivityLog.svelte';
  import Toolbar from './Toolbar.svelte';

  import '../events.css';

  const engine = cloudEngine();
  const plugins = [
    stagePlugin(),
    renderPlugin(),
    interactionPlugin(),
    selectionPlugin(),
    annotationPlugin(),
  ];

  const report: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };
</script>

<Viewer
  {engine}
  {plugins}
  identity={{ userId: 'u_381', displayName: 'Dana Smith' }}
  initialDocuments={[{ source: report }]}
>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <Toolbar />
    <div class="viewer">
      <Stage class="stage">
        <RenderLayer />
        <SelectionLayer />
        <AnnotationLayer />
      </Stage>
      <ActivityLog />
    </div>
  </DocumentGate>
</Viewer>
