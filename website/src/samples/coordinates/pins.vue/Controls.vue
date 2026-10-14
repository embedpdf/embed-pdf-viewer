<script setup lang="ts">
import { useStage } from '@embedpdf/vue/stage';
import type { Pin } from './pin';

defineProps<{ last: Pin | null }>();
const emit = defineEmits<{ clear: [] }>();

const stage = useStage();
</script>

<template>
  <div class="toolbar">
    <button type="button" class="button" @click="stage.zoomOut()">Zoom out</button>
    <button type="button" class="button" @click="stage.zoomIn()">Zoom in</button>
    <button type="button" class="button" @click="stage.rotateViewBy(90)">Rotate ⟳</button>
    <button type="button" class="button" @click="emit('clear')">Clear pins</button>
    <output class="badge">
      <template v-if="last">
        page <strong>{{ last.pageIndex + 1 }}</strong> · x
        <strong>{{ last.point.x.toFixed(1) }}</strong> · y
        <strong>{{ last.point.y.toFixed(1) }}</strong>
      </template>
      <template v-else>Click a page to drop a pin</template>
    </output>
  </div>
</template>
