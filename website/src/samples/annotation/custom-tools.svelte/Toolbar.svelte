<!-- A toolbar that builds itself from the tools: every tool with a label gets a button. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { useInteraction, useInteractionState } from '@embedpdf/svelte/interaction';
  import { useAnnotation } from '@embedpdf/svelte/annotation';

  const annotation = useAnnotation();
  const interaction = useInteraction();
  const tools = useInteractionState();
  const labelled = $derived(
    annotation.tools.list().filter((tool) => typeof tool.meta?.label === 'string'),
  );

  // On load: the arrow tool is active.
  onMount(() => {
    interaction.activateTool('arrow');
  });
</script>

<div class="toolbar">
  <div class="segmented" role="group" aria-label="Tool">
    <button
      type="button"
      aria-pressed={tools.activeToolId === 'pointer'}
      onclick={() => interaction.activateTool('pointer')}
    >
      Select
    </button>
    {#each labelled as tool (tool.id)}
      <button
        type="button"
        aria-pressed={tools.activeToolId === tool.id}
        onclick={() => interaction.activateTool(tool.id)}
      >
        {String(tool.meta?.label)}
      </button>
    {/each}
  </div>
</div>
