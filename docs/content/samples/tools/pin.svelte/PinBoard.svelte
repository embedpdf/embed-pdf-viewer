<script lang="ts">
  import { onMount } from 'svelte';
  import { RenderLayer } from '@embedpdf/svelte/render';
  import { Stage } from '@embedpdf/svelte/stage';
  import { svgCursor, useInteraction, useInteractionState } from '@embedpdf/svelte/interaction';
  import PinLayer, { type Pin } from './PinLayer.svelte';

  // The cursor is the pin itself; its tip is the point that clicks.
  const PIN_CURSOR = svgCursor({
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
      <path d="M12 23s7.5-7.4 7.5-12.5a7.5 7.5 0 0 0-15 0C4.5 15.6 12 23 12 23z" fill="#e5484d" stroke="#fff" stroke-width="1.5"/>
      <circle cx="12" cy="10.5" r="2.8" fill="#fff"/>
    </svg>`,
    hotspot: { x: 12, y: 23 },
    fallback: 'copy',
  });

  const interaction = useInteraction();
  const tools = useInteractionState();
  let pins: readonly Pin[] = $state.raw([]);

  // A tool of your own: a click on a page drops a pin there, in page coordinates.
  onMount(() => {
    const remove = interaction.registerTool({
      id: 'pin',
      cursor: PIN_CURSOR,
      onPointerDown: ({ page, point }) => {
        pins = [...pins, { id: pins.length + 1, page, point }];
        return true; // this tool handled the click
      },
    });
    interaction.activateTool('pin');
    return remove;
  });
</script>

<div class="toolbar">
  <div class="segmented" role="group" aria-label="Tool">
    <button
      type="button"
      class="segment"
      aria-pressed={tools.activeToolId === 'pin'}
      onclick={() => interaction.activateTool('pin')}
    >
      Pin
    </button>
    <button
      type="button"
      class="segment"
      aria-pressed={tools.activeToolId === 'pan'}
      onclick={() => interaction.activateTool('pan')}
    >
      Hand
    </button>
  </div>
  <button type="button" class="button" disabled={pins.length === 0} onclick={() => (pins = [])}>
    Clear
  </button>
  <output class="readout">
    {pins.length === 0 ? 'Click a page to drop a pin' : `${pins.length} pins`}
  </output>
</div>
<Stage class="stage">
  {#snippet children(page)}
    <RenderLayer />
    <PinLayer {page} {pins} />
  {/snippet}
</Stage>
