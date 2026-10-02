<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { interactionPlugin } from '@embedpdf/svelte/interaction';
  import { AnnotationLayer, annotationPlugin } from '@embedpdf/svelte/annotation';
  import { cloudEngine } from '@cloudpdf/engine';
  import Toolbar from './Toolbar.svelte';

  import '../ghost.css';

  const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
  // A preview for the rectangle (off by default for tools you drag), and a fainter one for notes.
  const plugins = [
    stagePlugin(),
    renderPlugin(),
    interactionPlugin(),
    annotationPlugin({
      tools: [
        { id: 'square', ghost: true },
        { id: 'note', ghost: { opacity: 0.3 } },
      ],
    }),
  ];

  const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };
</script>

<script lang="ts">
  // `--epdf-ghost-opacity` from CSS wins over each tool's own opacity, for every tool.
  let opacity = $state<number | null>(null);
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: ebook }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <Toolbar bind:opacity />
    <Stage class="stage" style={opacity === null ? undefined : `--epdf-ghost-opacity: ${opacity}`}>
      <RenderLayer annotations={false} />
      <AnnotationLayer />
    </Stage>
  </DocumentGate>
</Viewer>
