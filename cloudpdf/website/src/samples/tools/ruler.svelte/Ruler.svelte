<script lang="ts">
  import { onMount } from 'svelte';
  import { RenderLayer } from '@embedpdf/svelte/render';
  import { Stage } from '@embedpdf/svelte/stage';
  import { useInteraction } from '@embedpdf/svelte/interaction';
  import RulerLayer, { lengthOf, type Measurement, type Point } from './RulerLayer.svelte';

  const interaction = useInteraction();
  let measurement: Measurement | null = $state.raw(null);
  let pointer: Point | null = $state.raw(null);

  // A tool you drag with: the press starts a line, the moves stretch it, the release ends it.
  onMount(() => {
    const remove = interaction.registerTool({
      id: 'ruler',
      cursor: 'crosshair',
      touch: 'draw', // one finger measures, two fingers scroll and zoom
      onPointerDown: ({ page, point }) => {
        measurement = { page, from: point, to: point };
        return true;
      },
      onPointerMove: ({ point }) => {
        if (measurement) measurement = { ...measurement, to: point };
      },
      onPointerUp: ({ point }) => {
        if (measurement) measurement = { ...measurement, to: point };
      },
      onHover: ({ point }) => (pointer = point),
    });
    interaction.activateTool('ruler');
    return remove;
  });
</script>

<div class="toolbar">
  <output class="readout">
    {measurement ? lengthOf(measurement) : 'Drag on a page to measure'}
  </output>
  <output class="readout muted">
    {pointer ? `x ${Math.round(pointer.x)} · y ${Math.round(pointer.y)} pt` : ''}
  </output>
</div>
<Stage class="stage">
  {#snippet children(page)}
    <RenderLayer />
    <RulerLayer {page} {measurement} />
  {/snippet}
</Stage>
