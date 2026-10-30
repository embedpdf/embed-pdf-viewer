<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { interactionPlugin } from '@embedpdf/svelte/interaction';
  import { AnnotationLayer, annotationPlugin } from '@embedpdf/svelte/annotation';
  import { cloudEngine } from '@cloudpdf/engine';
  import PenStyle from './PenStyle.svelte';
  import RememberDefaults from './RememberDefaults.svelte';
  import StartWithThePen from './StartWithThePen.svelte';

  import '../tool-defaults.css';

  const engine = cloudEngine();
  // The pen starts with what the reader picked last time: see RememberDefaults.svelte.
  const plugins = [
    stagePlugin(),
    renderPlugin(),
    interactionPlugin(),
    annotationPlugin({
      tools: [{ id: 'ink', defaults: JSON.parse(localStorage.getItem('tool:ink') ?? '{}') }],
    }),
  ];

  const sketch: OpenInput = { kind: 'grant', grant: 'shr_IyOgSdO4AmJqV4BoMv5V0nYU' };
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: sketch }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <StartWithThePen />
    <RememberDefaults />
    <PenStyle />
    <Stage class="stage">
      <RenderLayer />
      <AnnotationLayer />
    </Stage>
  </DocumentGate>
</Viewer>
