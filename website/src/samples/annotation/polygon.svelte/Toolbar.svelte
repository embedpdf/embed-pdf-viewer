<script lang="ts">
  import { onMount } from 'svelte';
  import { useInteraction, useInteractionState } from '@embedpdf/svelte/interaction';

  const TOOLS = [
    { id: 'pointer', label: 'Select' },
    { id: 'polygon', label: 'Polygon' },
    { id: 'polyline', label: 'Polyline' },
  ];

  const interaction = useInteraction();
  const tools = useInteractionState();

  // The polygon tool is active on load: click a few points on the page.
  onMount(() => {
    interaction.activateTool('polygon');
  });
</script>

<div class="toolbar">
  <div class="segmented" role="group" aria-label="Tool">
    {#each TOOLS as tool (tool.id)}
      <button
        type="button"
        aria-pressed={tools.activeToolId === tool.id}
        onclick={() => interaction.activateTool(tool.id)}
      >
        {tool.label}
      </button>
    {/each}
  </div>
  <p class="hint">Delete removes the selection; Escape stops a shape</p>
</div>
