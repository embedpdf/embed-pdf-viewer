<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { interactionPlugin } from '@embedpdf/svelte/interaction';
  import {
    AnnotationLayer,
    annotationPlugin,
    type AnnotationRenderer,
  } from '@embedpdf/svelte/annotation';
  import { localEngine } from '@embedpdf/engine';
  import AddTextBox from './AddTextBox.svelte';
  import BrandedTextBox from './BrandedTextBox.svelte';
  import FormatButtons from './FormatButtons.svelte';

  import '../branded-text-box.css';

  const engine = localEngine();
  const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), annotationPlugin()];

  // [!doc-source ebook]
  const ebook = async (): Promise<OpenInput> => {
    const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
    return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
  };
  // [!/doc-source]

  const RENDERERS: AnnotationRenderer[] = [
    { for: (annotation) => annotation.subtype === 'free-text', component: BrandedTextBox },
  ];
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: ebook }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <AddTextBox />
    <FormatButtons />
    <Stage class="stage">
      <RenderLayer />
      <AnnotationLayer renderers={RENDERERS} />
    </Stage>
  </DocumentGate>
</Viewer>
