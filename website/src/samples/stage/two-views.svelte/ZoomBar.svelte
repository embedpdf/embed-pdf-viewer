<script lang="ts">
  import { useStage, useStageState, type StageTokenProp } from '@embedpdf/svelte/stage';

  let { label, token }: { label: string; token?: StageTokenProp } = $props();

  // The token is a prop, so it's passed as a function: the readers follow it if it changes.
  const stage = useStage(() => token);
  const zoomLevel = useStageState(
    (state) => state.zoomLevel,
    () => token,
  );
</script>

<div class="zoom-bar">
  <span class="caption">{label}</span>
  <button type="button" class="button" aria-label="Zoom out" onclick={() => stage.zoomOut()}>
    −
  </button>
  <output class="readout">{Math.round(zoomLevel.current * 100)}%</output>
  <button type="button" class="button" aria-label="Zoom in" onclick={() => stage.zoomIn()}>
    +
  </button>
</div>
