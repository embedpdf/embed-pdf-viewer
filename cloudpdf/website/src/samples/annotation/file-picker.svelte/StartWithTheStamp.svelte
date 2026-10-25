<!-- On load: the stamp tool is active. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { useInteraction } from '@embedpdf/svelte/interaction';

  const interaction = useInteraction();

  onMount(() => {
    interaction.activateTool('stamp');
  });
</script>
