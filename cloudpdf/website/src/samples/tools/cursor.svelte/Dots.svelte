<script lang="ts">
  import { onMount } from 'svelte';
  import { RenderLayer } from '@embedpdf/svelte/render';
  import { Stage } from '@embedpdf/svelte/stage';
  import { useInteraction } from '@embedpdf/svelte/interaction';
  import DotLayer, { type Dot } from './DotLayer.svelte';
  import PenCursor from './PenCursor.svelte';

  const COLORS = ['#e5484d', '#2f80ed', '#30a46c', '#1a2748'];

  const interaction = useInteraction();
  let color = $state(COLORS[0]!);
  let penCursor = $state(true);
  let dots: readonly Dot[] = $state.raw([]);

  // The tool reads the color at the moment of the click.
  onMount(() => {
    const remove = interaction.registerTool({
      id: 'dot',
      cursor: 'crosshair',
      onPointerDown: ({ page, point }) => {
        dots = [...dots, { id: dots.length + 1, page, point, color }];
        return true;
      },
    });
    interaction.activateTool('dot');
    return remove;
  });
</script>

{#if penCursor}
  <PenCursor {color} />
{/if}
<div class="toolbar">
  <div class="swatches" role="radiogroup" aria-label="Color">
    {#each COLORS as swatch (swatch)}
      <button
        type="button"
        role="radio"
        aria-checked={swatch === color}
        aria-label={swatch}
        class="swatch"
        style:background={swatch}
        onclick={() => (color = swatch)}
      ></button>
    {/each}
  </div>
  <label class="check">
    <input type="checkbox" bind:checked={penCursor} />
    Pen cursor
  </label>
</div>
<Stage class="stage">
  {#snippet children(page)}
    <RenderLayer />
    <DotLayer {page} {dots} />
  {/snippet}
</Stage>
