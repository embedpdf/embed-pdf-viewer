<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { SelectionLayer, selectionPlugin } from '@embedpdf/svelte/selection';
  import { interactionPlugin } from '@embedpdf/svelte/interaction';
  import {
    AnnotationLayer,
    annotationPlugin,
    type AnnotationRenderer,
  } from '@embedpdf/svelte/annotation';
  import { localEngine } from '@embedpdf/engine';
  import SelectTextBox from './SelectTextBox.svelte';
  import BrandedTextBox from './BrandedTextBox.svelte';
  import FormatButtons from './FormatButtons.svelte';

  import '../branded-text-box.css';

  const engine = localEngine();
  const plugins = [
    stagePlugin(),
    renderPlugin(),
    interactionPlugin(),
    selectionPlugin(),
    annotationPlugin(),
  ];

  // [!doc-source notice]
  const notice = async (): Promise<OpenInput> => {
    const response = await fetch('/pdfs/notice.pdf');
    return { kind: 'bytes', id: 'notice', bytes: new Uint8Array(await response.arrayBuffer()) };
  };
  // [!/doc-source]

  const RENDERERS: AnnotationRenderer[] = [
    { for: (annotation) => annotation.subtype === 'free-text', component: BrandedTextBox },
  ];
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: notice }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <SelectTextBox />
    <FormatButtons />
    <Stage class="stage">
      <RenderLayer />
      <SelectionLayer />
      <AnnotationLayer renderers={RENDERERS} />
    </Stage>
  </DocumentGate>
</Viewer>
