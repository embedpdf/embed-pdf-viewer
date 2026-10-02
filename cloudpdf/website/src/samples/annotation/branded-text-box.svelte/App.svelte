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
  import { cloudEngine } from '@cloudpdf/engine';
  import AddTextBox from './AddTextBox.svelte';
  import BrandedTextBox from './BrandedTextBox.svelte';
  import FormatButtons from './FormatButtons.svelte';

  import '../branded-text-box.css';

  const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
  const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), annotationPlugin()];

  const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

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
      <RenderLayer annotations={false} />
      <AnnotationLayer renderers={RENDERERS} />
    </Stage>
  </DocumentGate>
</Viewer>
