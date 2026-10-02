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
  import AddNotes from './AddNotes.svelte';
  import CommentBubble from './CommentBubble.svelte';
  import TurnButton from './TurnButton.svelte';

  import '../renderers.css';

  const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
  const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), annotationPlugin()];

  const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

  // Defined once, in the module: the layer registers each entry.
  const RENDERERS: AnnotationRenderer[] = [
    { for: (annotation) => annotation.subtype === 'text', component: CommentBubble },
  ];
  const NONE: AnnotationRenderer[] = [];
</script>

<script lang="ts">
  let mine = $state(true);
</script>

<Viewer
  {engine}
  {plugins}
  identity={{ userId: 'u_381', displayName: 'Dana Smith' }}
  initialDocuments={[{ source: ebook }]}
>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <AddNotes />
    <div class="toolbar">
      <div class="segmented" role="group" aria-label="Look">
        <button type="button" aria-pressed={mine} onclick={() => (mine = true)}>Your look</button>
        <button type="button" aria-pressed={!mine} onclick={() => (mine = false)}>
          The PDF's look
        </button>
      </div>
      <TurnButton />
    </div>
    <Stage class="stage">
      <RenderLayer annotations={false} />
      <AnnotationLayer renderers={mine ? RENDERERS : NONE} />
    </Stage>
  </DocumentGate>
</Viewer>
