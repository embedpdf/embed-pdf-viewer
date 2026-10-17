<script lang="ts">
  import { useStage, useStageState } from '@embedpdf/svelte/stage';

  const stage = useStage();
  const state = useStageState();
</script>

<div class="toolbar">
  <button type="button" class="button" onclick={() => stage.rotateViewBy(-90)}>⟲ Rotate left</button
  >
  <output class="readout">{state.viewRotation}°</output>
  <button type="button" class="button" onclick={() => stage.rotateViewBy(90)}>⟳ Rotate right</button
  >
  <button
    type="button"
    class="button"
    disabled={state.viewRotation === 0}
    onclick={() => stage.setViewRotation(0)}
  >
    Upright
  </button>
</div>
