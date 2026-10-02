<script lang="ts">
  import { onMount } from 'svelte';
  import { useInteraction, useInteractionState } from '@embedpdf/svelte/interaction';

  const TOOLS = [
    { id: 'square', label: 'Rectangle', hint: 'A click makes 120 × 80 points' },
    { id: 'arrow', label: 'Arrow', hint: 'A click points an arrow down at it' },
    { id: 'circle', label: 'Circle', hint: 'Drag only: a click does nothing' },
  ];

  const interaction = useInteraction();
  const tools = useInteractionState();
  const active = $derived(TOOLS.find((tool) => tool.id === tools.activeToolId));

  // The rectangle tool is active on load: click the page.
  onMount(() => {
    interaction.activateTool('square');
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
  <p class="hint">{active?.hint ?? 'Pick a tool, then click the page'}</p>
</div>
