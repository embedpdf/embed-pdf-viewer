<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { interactionPlugin } from '@embedpdf/svelte/interaction';
  import { searchPlugin } from '@embedpdf/svelte/search';
  import { AnnotationLayer, annotationPlugin } from '@embedpdf/svelte/annotation';
  import { redactionPlugin } from '@embedpdf/svelte/redaction';
  import { localEngine } from '@embedpdf/engine';
  import MarkSome from './MarkSome.svelte';
  import PendingMarks from './PendingMarks.svelte';

  import '../review.css';

  const engine = localEngine();
  const plugins = [
    stagePlugin(),
    renderPlugin(),
    interactionPlugin(),
    searchPlugin(),
    annotationPlugin(),
    redactionPlugin(),
  ];

  // [!doc-source welcome]
  const welcome = async (): Promise<OpenInput> => {
    const response = await fetch('/pdfs/welcome.pdf');
    return { kind: 'bytes', id: 'welcome', bytes: new Uint8Array(await response.arrayBuffer()) };
  };
  // [!/doc-source]
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: welcome }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <MarkSome />
    <div class="viewer">
      <Stage class="stage">
        <RenderLayer />
        <AnnotationLayer />
      </Stage>
      <PendingMarks />
    </div>
  </DocumentGate>
</Viewer>
