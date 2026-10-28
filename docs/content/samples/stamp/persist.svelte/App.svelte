<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { SelectionLayer, selectionPlugin } from '@embedpdf/svelte/selection';
  import { interactionPlugin } from '@embedpdf/svelte/interaction';
  import { AnnotationLayer, annotationPlugin } from '@embedpdf/svelte/annotation';
  import { stampPlugin } from '@embedpdf/svelte/stamp';
  import { localEngine } from '@embedpdf/engine';
  import Libraries from './Libraries.svelte';

  import '../persist.css';

  const engine = localEngine();
  // [!asset-engine]
  const assetEngine = engine; // stamp libraries are PDFs; they open here too
  // [!/asset-engine]
  const plugins = [
    stagePlugin(),
    renderPlugin(),
    interactionPlugin(),
    selectionPlugin(),
    annotationPlugin(),
    stampPlugin({ assetEngine }),
  ];

  // [!doc-source approvals]
  const approvals = async (): Promise<OpenInput> => {
    const response = await fetch('/pdfs/approvals.pdf');
    return { kind: 'bytes', id: 'approvals', bytes: new Uint8Array(await response.arrayBuffer()) };
  };
  // [!/doc-source]
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: approvals }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <Libraries />
    <Stage class="stage">
      <RenderLayer />
      <SelectionLayer />
      <AnnotationLayer />
    </Stage>
  </DocumentGate>
</Viewer>
