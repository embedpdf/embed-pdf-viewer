<template>
  <canvas
    ref="canvasRef"
    :style="{
      position: 'absolute',
      width: '100%',
      height: '100%',
      display: 'block',
      pointerEvents: 'none',
      ...style,
    }"
  />
</template>

<script setup lang="ts">
import { ref, watchEffect, type CSSProperties } from 'vue';
import type { AnnotationAppearanceImage } from '@embedpdf/models';

const props = defineProps<{
  appearance: AnnotationAppearanceImage;
  style?: CSSProperties;
}>();

const canvasRef = ref<HTMLCanvasElement>();

watchEffect(() => {
  const canvas = canvasRef.value;
  if (!canvas) return;

  const { data } = props.appearance;
  canvas.width = data.width;
  canvas.height = data.height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const imageData = new ImageData(data.data, data.width, data.height);
  ctx.putImageData(imageData, 0, 0);
});
</script>
