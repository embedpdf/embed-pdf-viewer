<template>
  <div v-if="match?.renderPreview" :style="style">
    <component
      :is="match.renderPreview"
      :data="preview.data"
      :bounds="preview.bounds"
      :scale="scale"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, CSSProperties } from 'vue';
import { PreviewState } from '@embedpdf/plugin-annotation';
import { useRendererRegistry } from '../context/renderer-registry';
import { builtInRenderers } from './built-in-renderers';

const props = defineProps<{
  toolId: string;
  preview: PreviewState;
  scale: number;
}>();

const registry = useRendererRegistry();

const allRenderers = computed(() => {
  const external = registry?.getAll() ?? [];
  const externalIds = new Set(external.map((r) => r.id));
  return [...external, ...builtInRenderers.filter((r) => !externalIds.has(r.id))];
});

const match = computed(
  () =>
    allRenderers.value.find((r) => r.matchesPreview?.(props.preview) && r.renderPreview) ??
    allRenderers.value.find((r) => r.id === props.toolId && r.renderPreview) ??
    null,
);

const style = computed<CSSProperties>(() => ({
  position: 'absolute',
  left: `${props.preview.bounds.origin.x * props.scale}px`,
  top: `${props.preview.bounds.origin.y * props.scale}px`,
  width: `${props.preview.bounds.size.width * props.scale}px`,
  height: `${props.preview.bounds.size.height * props.scale}px`,
  pointerEvents: 'none',
  zIndex: 10,
  ...match.value?.previewContainerStyle?.({
    data: props.preview.data,
    bounds: props.preview.bounds,
    scale: props.scale,
  }),
}));
</script>
