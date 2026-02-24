<template>
  <input ref="fileInputRef" type="file" style="display: none" />
  <canvas ref="canvasRef" style="display: none"></canvas>
  <PreviewRenderer
    v-for="[toolId, preview] in previews.entries()"
    :key="toolId"
    :preview="preview"
    :scale="scale"
  />
</template>

<script setup lang="ts">
import { ref, watchEffect, computed } from 'vue';
import { useAnnotationPlugin } from '../hooks';
import { AnyPreviewState, HandlerServices } from '@embedpdf/plugin-annotation';
import PreviewRenderer from './preview-renderer.vue';

const props = defineProps<{
  documentId: string;
  pageIndex: number;
  scale: number;
}>();

const { plugin: annotationPlugin } = useAnnotationPlugin();
const previews = ref<Map<string, AnyPreviewState>>(new Map());
const fileInputRef = ref<HTMLInputElement | null>(null);
const canvasRef = ref<HTMLCanvasElement | null>(null);

const services = computed<HandlerServices>(() => ({
  requestFile: ({ accept, onFile }) => {
    const input = fileInputRef.value;
    if (!input) return;
    input.accept = accept;
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        onFile(file);
        input.value = '';
      }
    };
    input.click();
  },
  processImage: ({ source, maxWidth, maxHeight, onComplete }) => {
    const canvas = canvasRef.value;
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      let { naturalWidth: width, naturalHeight: height } = img;
      const scaleX = maxWidth ? maxWidth / width : 1;
      const scaleY = maxHeight ? maxHeight / height : 1;
      const scaleFactor = Math.min(scaleX, scaleY, 1);
      const finalWidth = width * scaleFactor;
      const finalHeight = height * scaleFactor;

      canvas.width = finalWidth;
      canvas.height = finalHeight;
      ctx.drawImage(img, 0, 0, finalWidth, finalHeight);

      const imageData = ctx.getImageData(0, 0, finalWidth, finalHeight);
      if (typeof source !== 'string') URL.revokeObjectURL(img.src);

      onComplete({ imageData, width: finalWidth, height: finalHeight });
    };
    img.src = typeof source === 'string' ? source : URL.createObjectURL(source);
  },
}));

let unregister: (() => void) | undefined;

watchEffect((onCleanup) => {
  if (annotationPlugin.value) {
    unregister = annotationPlugin.value.registerPageHandlers(
      props.documentId,
      props.pageIndex,
      props.scale,
      {
        services: services.value,
        onPreview: (toolId, state) => {
          const next = new Map(previews.value);
          if (state) {
            next.set(toolId, state);
          } else {
            next.delete(toolId);
          }
          previews.value = next;
        },
      },
    );
  }

  onCleanup(() => {
    unregister?.();
  });
});
</script>
