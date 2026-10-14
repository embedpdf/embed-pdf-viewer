<script lang="ts">
  import { useInteraction, useInteractionState } from '@embedpdf/svelte/interaction';

  const interaction = useInteraction();
  const state = useInteractionState();
  const on = $derived(state.activeToolId === 'highlight');
</script>

<button aria-pressed={on} onclick={() => interaction.activateTool(on ? 'pointer' : 'highlight')}>
  Highlight
</button>
