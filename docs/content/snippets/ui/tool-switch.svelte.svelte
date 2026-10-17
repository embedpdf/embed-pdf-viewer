<script lang="ts">
  import { useInteraction, useInteractionState } from '@embedpdf/svelte/interaction';

  const interaction = useInteraction();
  const state = useInteractionState();
</script>

<button aria-pressed={state.activeToolId === 'pointer'} onclick={() => interaction.activateTool('pointer')}>
  Select
</button>
<button aria-pressed={state.activeToolId === 'pan'} onclick={() => interaction.activateTool('pan')}>
  Hand
</button>
