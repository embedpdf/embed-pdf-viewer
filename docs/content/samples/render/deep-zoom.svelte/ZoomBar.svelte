<script lang="ts">
  import { useStage, useStageState } from '@embedpdf/svelte/stage';

  const stage = useStage();
  const zoomLevel = useStageState((state) => state.zoomLevel);
</script>

<div class="toolbar">
  <button type="button" class="button" aria-label="Zoom out" onclick={() => stage.zoomOut()}>
    −
  </button>
  <output class="readout">{Math.round(zoomLevel.current * 100)}%</output>
  <button type="button" class="button" aria-label="Zoom in" onclick={() => stage.zoomIn()}>
    +
  </button>
  <button type="button" class="button push" onclick={() => stage.fitWidth()}>Fit width</button>
</div>
