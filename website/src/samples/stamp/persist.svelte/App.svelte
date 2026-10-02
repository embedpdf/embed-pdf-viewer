<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { interactionPlugin } from '@embedpdf/svelte/interaction';
  import { AnnotationLayer, annotationPlugin } from '@embedpdf/svelte/annotation';
  import { stampPlugin } from '@embedpdf/svelte/stamp';
  import { localEngine } from '@embedpdf/engine';
  import Libraries from './Libraries.svelte';

  import '../persist.css';

  const engine = localEngine();
  const assetEngine = engine; // stamp libraries are PDFs; they open here too
  const plugins = [
    stagePlugin(),
    renderPlugin(),
    interactionPlugin(),
    annotationPlugin(),
    stampPlugin({ assetEngine }),
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
    <Libraries />
    <Stage class="stage">
      <RenderLayer annotations={false} />
      <AnnotationLayer />
    </Stage>
  </DocumentGate>
</Viewer>
