<script lang="ts">
  import { useInteraction } from '@embedpdf/svelte/interaction';

  const interaction = useInteraction();

  function down(event: KeyboardEvent) {
    if (event.code === 'Space' && !event.repeat) interaction.pushTool('pan');
  }
  function up(event: KeyboardEvent) {
    if (event.code === 'Space') interaction.popTool();
  }
</script>

<svelte:window onkeydown={down} onkeyup={up} />
