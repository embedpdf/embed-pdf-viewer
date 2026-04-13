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
      borderRadius: '50%',
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
    <div
      v-if="isChecked"
      :style="{
        width: '50%',
        height: '50%',
        borderRadius: '50%',
        background: '#000000',
      }"
    ></div>
  </div>
</template>
