<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { SelectionLayer, selectionPlugin } from '@embedpdf/svelte/selection';
  import { interactionPlugin } from '@embedpdf/svelte/interaction';
  import { AnnotationLayer, annotationPlugin } from '@embedpdf/svelte/annotation';
  import { localEngine } from '@embedpdf/engine';
  import ShowStamps from './ShowStamps.svelte';
  import Approvals from './Approvals.svelte';

  import '../stamp-status.css';

  const engine = localEngine();
  const plugins = [
    stagePlugin(),
    renderPlugin(),
    interactionPlugin(),
    selectionPlugin(),
    annotationPlugin(),
  ];

  // [!doc-source approvals]
  const approvals = async (): Promise<OpenInput> => {
    const response = await fetch('/pdfs/embedpdf-approvals.pdf');
    return { kind: 'bytes', id: 'approvals', bytes: new Uint8Array(await response.arrayBuffer()) };
  };
  // [!/doc-source]
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: approvals }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <ShowStamps />
    <p class="hint">Sign a stamp off, then move it: its status goes with it.</p>
    <Stage class="stage">
      <RenderLayer />
      <SelectionLayer />
      <AnnotationLayer />
      {#snippet overlay()}
        <Approvals />
      {/snippet}
    </Stage>
  </DocumentGate>
</Viewer>
