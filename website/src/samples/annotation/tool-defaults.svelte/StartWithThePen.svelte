<!-- On load: the pen is active. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { useInteraction } from '@embedpdf/svelte/interaction';

  const interaction = useInteraction();

  onMount(() => {
    interaction.activateTool('ink');
  });
</script>
