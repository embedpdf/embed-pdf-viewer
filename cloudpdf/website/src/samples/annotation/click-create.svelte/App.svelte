<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { interactionPlugin } from '@embedpdf/svelte/interaction';
  import { AnnotationLayer, annotationPlugin } from '@embedpdf/svelte/annotation';
  import { cloudEngine } from '@cloudpdf/engine';
  import Toolbar from './Toolbar.svelte';

  import '../click-create.css';

  const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
  // What one click makes: a 120 × 80 rectangle, an arrow pointing down at the click, and no circle.
  const plugins = [
    stagePlugin(),
    renderPlugin(),
    interactionPlugin(),
    annotationPlugin({
      tools: [
        { id: 'square', clickCreate: { width: 120, height: 80 } },
        {
          id: 'arrow',
          extends: 'line',
          defaults: { lineEndings: { start: 'none', end: 'closed-arrow' } },
          clickCreate: { length: 80, rotation: 90, anchor: 'end' },
        },
        { id: 'circle', clickCreate: false }, // drag only
      ],
    }),
  ];

  const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: ebook }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <Toolbar />
    <Stage class="stage">
      <RenderLayer />
      <AnnotationLayer />
    </Stage>
  </DocumentGate>
</Viewer>
