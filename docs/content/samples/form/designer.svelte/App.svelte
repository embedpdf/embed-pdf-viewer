<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { interactionPlugin } from '@embedpdf/svelte/interaction';
  import { AnnotationLayer, annotationPlugin } from '@embedpdf/svelte/annotation';
  import { FormLayer, formPlugin } from '@embedpdf/svelte/form';
  import { localEngine } from '@embedpdf/engine';
  import FieldPalette from './FieldPalette.svelte';

  import '../designer.css';

  const engine = localEngine();
  // Building forms needs the annotation plugin: in design mode, fields are boxes like any annotation.
  const plugins = [
    stagePlugin(),
    renderPlugin(),
    interactionPlugin(),
    annotationPlugin(),
    formPlugin(),
  ];

  // [!doc-source ebook]
  const ebook = async (): Promise<OpenInput> => {
    const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
    return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
  };
  // [!/doc-source]
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: ebook }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <FieldPalette />
    <Stage class="stage">
      <RenderLayer annotations={false} />
      <AnnotationLayer />
      <FormLayer />
    </Stage>
  </DocumentGate>
</Viewer>
