<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { interactionPlugin } from '@embedpdf/svelte/interaction';
  import { AnnotationLayer, annotationPlugin } from '@embedpdf/svelte/annotation';
  import { cloudEngine } from '@cloudpdf/engine';
  import AddRectangle from './AddRectangle.svelte';

  import '../annotations.css';

  const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
  const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), annotationPlugin()];

  const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

  type Painter = 'picture' | 'layer';
</script>

<script lang="ts">
  let painter = $state<Painter>('picture');
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: ebook }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <AddRectangle />
    <div class="toolbar">
      <div class="segmented" role="group" aria-label="Who draws the annotations">
        <button
          type="button"
          aria-pressed={painter === 'picture'}
          onclick={() => (painter = 'picture')}
        >
          In the page picture
        </button>
        <button type="button" aria-pressed={painter === 'layer'} onclick={() => (painter = 'layer')}>
          Drawn by the annotation layer
        </button>
      </div>
      <p class="hint">
        {painter === 'picture'
          ? 'Part of the picture: it can’t be picked up.'
          : 'Left out of the picture: click it, then drag it.'}
      </p>
    </div>
    <Stage class="stage">
      {#if painter === 'picture'}
        <RenderLayer />
      {:else}
        <RenderLayer annotations={false} />
        <AnnotationLayer />
      {/if}
    </Stage>
  </DocumentGate>
</Viewer>
