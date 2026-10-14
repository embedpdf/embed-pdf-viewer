<script lang="ts">
  import { useInteraction } from '@embedpdf/svelte/interaction';

  const interaction = useInteraction();
</script>

<button onclick={() => interaction.activateTool('distance')}>Measure</button>
