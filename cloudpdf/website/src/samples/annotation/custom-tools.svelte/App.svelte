<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { interactionPlugin } from '@embedpdf/svelte/interaction';
  import { AnnotationLayer, annotationPlugin } from '@embedpdf/svelte/annotation';
  import { cloudEngine } from '@cloudpdf/engine';
  import Toolbar from './Toolbar.svelte';

  import '../custom-tools.css';

  const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
  // A blue pen, an arrow, and three tools of your own. `meta` is yours: the toolbar reads its label.
  const plugins = [
    stagePlugin(),
    renderPlugin(),
    interactionPlugin(),
    annotationPlugin({
      tools: [
        { id: 'ink', defaults: { color: '#1e90ff', strokeWidth: 3 }, meta: { label: 'Blue pen' } },
        {
          id: 'arrow',
          extends: 'line',
          defaults: { lineEndings: { start: 'none', end: 'closed-arrow' } },
          meta: { label: 'Arrow' },
        },
        {
          id: 'red-pen',
          extends: 'ink',
          defaults: { color: '#ff0000', strokeWidth: 2 },
          meta: { label: 'Red pen' },
        },
        {
          id: 'marker',
          extends: 'ink-highlight',
          defaults: { color: '#ffa500' },
          meta: { label: 'Marker' },
        },
        {
          id: 'todo',
          extends: 'note',
          defaults: { icon: 'key', contents: 'TODO' },
          meta: { label: 'To do' },
        },
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
      <RenderLayer annotations={false} />
      <AnnotationLayer />
    </Stage>
  </DocumentGate>
</Viewer>
