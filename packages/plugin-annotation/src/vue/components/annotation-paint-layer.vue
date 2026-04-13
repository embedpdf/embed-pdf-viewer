<template>
  <input ref="fileInputRef" type="file" style="display: none" />
  <PreviewRenderer
    v-for="[toolId, preview] in previews.entries()"
    :key="toolId"
    :toolId="toolId"
    :preview="preview"
    :scale="scale"
  />
</template>

<script setup lang="ts">
import { ref, watchEffect, computed } from 'vue';
import { useAnnotationPlugin } from '../hooks';
import { PreviewState, HandlerServices } from '@embedpdf/plugin-annotation';
import PreviewRenderer from './preview-renderer.vue';

const props = defineProps<{
  documentId: string;
  pageIndex: number;
  scale: number;
}>();

const { plugin: annotationPlugin } = useAnnotationPlugin();
const previews = ref<Map<string, PreviewState>>(new Map());
const fileInputRef = ref<HTMLInputElement | null>(null);

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
