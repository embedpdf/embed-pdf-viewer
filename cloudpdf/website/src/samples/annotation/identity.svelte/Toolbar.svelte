<script lang="ts">
  import { useInteraction, useInteractionState } from '@embedpdf/svelte/interaction';

  const TOOLS = [
    { id: 'pointer', label: 'Select' },
    { id: 'square', label: 'Rectangle' },
    { id: 'note', label: 'Note' },
  ];

  const interaction = useInteraction();
  const tools = useInteractionState();
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
</div>
