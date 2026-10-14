<script lang="ts">
  import { useStage, useStageState } from '@embedpdf/svelte/stage';

  const stage = useStage();
  const state = useStageState();
</script>

<div class="toolbar">
  <button type="button" class="button" aria-label="Zoom out" onclick={() => stage.zoomOut()}>
    −
  </button>
  <output class="readout">{Math.round(state.zoomLevel * 100)}%</output>
  <button type="button" class="button" aria-label="Zoom in" onclick={() => stage.zoomIn()}>
    +
  </button>
  <div class="segmented" role="group" aria-label="Fit">
    <button
      type="button"
      aria-pressed={state.zoomMode === 'automatic'}
      onclick={() => stage.fitAutomatic()}
    >
      Automatic
    </button>
    <button
      type="button"
      aria-pressed={state.zoomMode === 'fit-page'}
      onclick={() => stage.fitPage()}
    >
      Fit page
    </button>
    <button
      type="button"
      aria-pressed={state.zoomMode === 'fit-width'}
      onclick={() => stage.fitWidth()}
    >
      Fit width
    </button>
  </div>
</div>
