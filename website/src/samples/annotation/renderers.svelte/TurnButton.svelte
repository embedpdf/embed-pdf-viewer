<!-- A note keeps its size on screen and stays upright: turn the view to see it. -->
<script lang="ts">
  import { useStage } from '@embedpdf/svelte/stage';

  const stage = useStage();
</script>

<button type="button" class="button" onclick={() => stage.rotateViewBy(90)}>Turn the view</button>
