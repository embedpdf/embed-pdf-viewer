<script lang="ts">
  import { onMount } from 'svelte';
  import { useInteraction, useInteractionState } from '@embedpdf/svelte/interaction';
  import { useAnnotation, useAnnotationDefaults } from '@embedpdf/svelte/annotation';

  const COLORS = ['#e5484d', '#1e90ff', '#30a46c', '#1a2748'];

  const annotation = useAnnotation();
  const interaction = useInteraction();
  const tools = useInteractionState();
  const defaults = useAnnotationDefaults('ink');

  // The pen is active on load: move the pointer over the page.
  onMount(() => {
    interaction.activateTool('ink');
  });

  function pick(swatch: string) {
    annotation.tools.updateDefaults('ink', { color: swatch });
    interaction.activateTool('ink');
  }
</script>

<div class="toolbar">
  <button
    type="button"
    class="button"
    aria-pressed={tools.activeToolId === 'ink'}
    onclick={() => interaction.activateTool('ink')}
  >
    Pen
  </button>
  <div class="swatches" role="group" aria-label="Pen color">
    {#each COLORS as swatch (swatch)}
      <button
        type="button"
        class="swatch"
        aria-label={swatch}
        aria-pressed={defaults.current.color === swatch}
        style:background={swatch}
        onclick={() => pick(swatch)}
      ></button>
    {/each}
  </div>
  <button
    type="button"
    class="button"
    aria-pressed={tools.activeToolId === 'square'}
    onclick={() => interaction.activateTool('square')}
  >
    Rectangle
  </button>
</div>
