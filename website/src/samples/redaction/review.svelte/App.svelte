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

  const ebook = async (): Promise<OpenInput> => {
    const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
    return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
  };
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: ebook }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <MarkSome />
    <div class="viewer">
      <Stage class="stage">
        <RenderLayer annotations={false} />
        <AnnotationLayer />
      </Stage>
      <PendingMarks />
    </div>
  </DocumentGate>
</Viewer>
