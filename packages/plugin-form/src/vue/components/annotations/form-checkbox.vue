<script setup lang="ts">
import { computed, ref } from 'vue';
import type { AnnotationRendererProps } from '@embedpdf/plugin-annotation/vue';
import type { PdfWidgetAnnoObject } from '@embedpdf/models';
import { isWidgetChecked } from '@embedpdf/models';

const props = defineProps<AnnotationRendererProps<PdfWidgetAnnoObject>>();

const isHovered = ref(false);

const object = computed(() => props.currentObject);
const isChecked = computed(() => isWidgetChecked(object.value));
const borderWidth = computed(() => (object.value.strokeWidth ?? 1) * props.scale);
</script>

<template>
  <div
    @pointerdown="
      (e) => {
        if (!props.isSelected) props.onClick?.(e);
      }
    "
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
    :style="{
      position: 'absolute',
      inset: '0',
      background: object.color ?? '#FFFFFF',
      border: `${borderWidth}px solid ${object.strokeColor ?? '#000000'}`,
      outline: isHovered || props.isSelected ? '1px solid rgba(66, 133, 244, 0.5)' : 'none',
      outlineOffset: '-1px',
      boxSizing: 'border-box',
      pointerEvents: 'auto',
      cursor: props.isSelected ? 'move' : 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }"
  >
    <svg v-if="isChecked" viewBox="0 0 100 100" style="width: 100%; height: 100%">
      <path
        d="M28 48C27.45 50.21 29.45 63.13 30 67C30.55 69.21 34.58 72 39 72C44.52 71.45 76.55 32.55 76 32C77.1 31.45 76 25 76 25C74.34 22.24 68 25.45 68 26C68 26 43.55 53 43 53C41.34 53 40.55 41.1 40 40C33.37 36.69 29.1 45.79 28 48Z"
        fill="#000000"
      />
    </svg>
  </div>
</template>
