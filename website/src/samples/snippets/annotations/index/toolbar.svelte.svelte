<script lang="ts">
  import { useInteraction, useInteractionState } from '@embedpdf/svelte/interaction';

  const tools = ['pointer', 'square', 'ink', 'highlight', 'note'];

  const interaction = useInteraction();
  const state = useInteractionState();
</script>

{#each tools as id (id)}
  <button aria-pressed={state.activeToolId === id} onclick={() => interaction.activateTool(id)}>
    {id}
  </button>
{/each}
