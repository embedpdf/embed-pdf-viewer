<!-- The view's own controls: the switches follow the view when it zooms and turns. -->
<script lang="ts">
  import { useStage } from '@embedpdf/svelte/stage';

  const stage = useStage();
</script>

<div class="toolbar">
  <button type="button" class="button" onclick={() => stage.zoomOut()}>Zoom out</button>
  <button type="button" class="button" onclick={() => stage.zoomIn()}>Zoom in</button>
  <button type="button" class="button" onclick={() => stage.rotateViewBy(90)}>Turn the view</button>
</div>
