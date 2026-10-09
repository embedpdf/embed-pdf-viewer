<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { interactionPlugin } from '@embedpdf/svelte/interaction';
  import { AnnotationLayer, annotationPlugin } from '@embedpdf/svelte/annotation';
  import { stampPlugin } from '@embedpdf/svelte/stamp';
  import { cloudEngine } from '@cloudpdf/engine';
import { localEngine } from '@embedpdf/engine';
  import DrawSeal from './DrawSeal.svelte';
  import MakeStamp from './MakeStamp.svelte';

  import '../from-selection.css';

  const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
  const assetEngine = localEngine();
  const plugins = [
    stagePlugin(),
    renderPlugin(),
    interactionPlugin(),
    annotationPlugin(),
    stampPlugin({ assetEngine }),
  ];

  const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: ebook }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <DrawSeal />
    <MakeStamp />
    <Stage class="stage">
      <RenderLayer />
      <AnnotationLayer />
    </Stage>
  </DocumentGate>
</Viewer>
