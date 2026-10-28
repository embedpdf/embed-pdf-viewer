<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { SelectionLayer, selectionPlugin } from '@embedpdf/svelte/selection';
  import { interactionPlugin } from '@embedpdf/svelte/interaction';
  import { AnnotationLayer, annotationPlugin } from '@embedpdf/svelte/annotation';
  import { localEngine } from '@embedpdf/engine';
  import ActivityLog from './ActivityLog.svelte';
  import Toolbar from './Toolbar.svelte';

  import '../events.css';

  const engine = localEngine();
  const plugins = [
    stagePlugin(),
    renderPlugin(),
    interactionPlugin(),
    selectionPlugin(),
    annotationPlugin(),
  ];

  // [!doc-source report]
  const report = async (): Promise<OpenInput> => {
    const response = await fetch('/pdfs/report.pdf');
    return { kind: 'bytes', id: 'report', bytes: new Uint8Array(await response.arrayBuffer()) };
  };
  // [!/doc-source]
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
