<script setup lang="ts">
import { useStage, useStageState } from '@embedpdf/vue/stage';

const stage = useStage();
const viewRotation = useStageState((state) => state.viewRotation);
</script>

<template>
  <div class="toolbar">
    <button type="button" class="button" @click="stage.rotateViewBy(-90)">⟲ Rotate left</button>
    <output class="readout">{{ viewRotation }}°</output>
    <button type="button" class="button" @click="stage.rotateViewBy(90)">⟳ Rotate right</button>
    <button
      type="button"
      class="button"
      :disabled="viewRotation === 0"
      @click="stage.setViewRotation(0)"
    >
      Upright
    </button>
  </div>
</template>
