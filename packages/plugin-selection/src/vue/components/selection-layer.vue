<script setup lang="ts">
import { computed } from 'vue';
import { Rotation } from '@embedpdf/models';
import type { TextSelectionStyle, MarqueeSelectionStyle } from '@embedpdf/plugin-selection';
import type { SelectionSelectionMenuRenderFn } from '../types';
import TextSelection from './text-selection.vue';
import MarqueeSelection from './marquee-selection.vue';

interface SelectionLayerProps {
  documentId: string;
  pageIndex: number;
  scale?: number;
  rotation?: Rotation;
  /**
   * @deprecated Use `textStyle.background` instead.
   * Background color for selection rectangles.
   */
  background?: string;
  /** Styling options for text selection highlights */
  textStyle?: TextSelectionStyle;
  /** Styling options for the marquee selection rectangle */
  marqueeStyle?: MarqueeSelectionStyle;
  /** Optional CSS class applied to the marquee rectangle */
  marqueeClassName?: string;
  /** Render function for selection menu (schema-driven approach) */
  selectionMenu?: SelectionSelectionMenuRenderFn;
}

const props = withDefaults(defineProps<SelectionLayerProps>(), {
  rotation: Rotation.Degree0,
});

const resolvedTextBackground = computed(() => props.textStyle?.background ?? props.background);
</script>

<template>
  <TextSelection
    :document-id="documentId"
    :page-index="pageIndex"
    :scale="scale"
    :rotation="rotation"
    :background="resolvedTextBackground"
    :selection-menu="selectionMenu"
  >
    <template #selection-menu="menuProps">
      <slot name="selection-menu" v-bind="menuProps" />
    </template>
  </TextSelection>
  <MarqueeSelection
    :document-id="documentId"
    :page-index="pageIndex"
    :scale="scale"
    :background="marqueeStyle?.background"
    :border-color="marqueeStyle?.borderColor"
    :border-style="marqueeStyle?.borderStyle"
    :class-name="marqueeClassName"
  />
</template>
