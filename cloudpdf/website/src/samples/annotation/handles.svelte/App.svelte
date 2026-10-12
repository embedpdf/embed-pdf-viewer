<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { interactionPlugin } from '@embedpdf/svelte/interaction';
  import {
    AnnotationLayer,
    annotationPlugin,
    type HandleProps,
    type RotationHandleProps,
  } from '@embedpdf/svelte/annotation';
  import { cloudEngine } from '@cloudpdf/engine';
  import AddRectangle from './AddRectangle.svelte';
  import ChromeControls from './ChromeControls.svelte';

  import '../handles.css';

  const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
  const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), annotationPlugin()];

  const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };
</script>

<script lang="ts">
  let own = $state(false);
</script>

<!-- Your own handles: the layer places them, and still decides where they can be grabbed. -->
{#snippet handle({ at, size, rotation, kind, active }: HandleProps)}
  <div
    class={['handle', `handle--${kind}`, active && 'handle--active']}
    style:left="{at.x - size / 2}px"
    style:top="{at.y - size / 2}px"
    style:width="{size}px"
    style:height="{size}px"
    style:rotate="{rotation}deg"
  ></div>
{/snippet}

{#snippet rotationHandle({ at, size, active }: RotationHandleProps)}
  <div
    class={['turn', active && 'turn--active']}
    style:left="{at.x - size}px"
    style:top="{at.y - size}px"
    style:width="{size * 2}px"
    style:height="{size * 2}px"
  >
    ↻
  </div>
{/snippet}

<Viewer {engine} {plugins} initialDocuments={[{ source: ebook }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <AddRectangle />
    <ChromeControls bind:own />
    <Stage class="stage">
      <RenderLayer />
      <AnnotationLayer
        handle={own ? handle : undefined}
        rotationHandle={own ? rotationHandle : undefined}
      />
    </Stage>
  </DocumentGate>
</Viewer>
