<script lang="ts">
  import { useStage, useStageState } from '@embedpdf/svelte/stage';

  const stage = useStage();
  const state = useStageState();
</script>

<div>
  <button onclick={() => stage.zoomOut()}>−</button>
  <span>{Math.round(state.zoomLevel * 100)}%</span>
  <button onclick={() => stage.zoomIn()}>+</button>
  <button onclick={() => stage.fitWidth()} aria-pressed={state.zoomMode === 'fit-width'}>
    Fit width
  </button>
</div>
