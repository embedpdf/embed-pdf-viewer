<template>
  <div :style="style">
    <Circle
      v-if="preview.type === PdfAnnotationSubtype.CIRCLE"
      :isSelected="false"
      :scale="scale"
      v-bind="preview.data"
    />
    <Square
      v-else-if="preview.type === PdfAnnotationSubtype.SQUARE"
      :isSelected="false"
      :scale="scale"
      v-bind="preview.data"
    />
    <Polygon
      v-else-if="preview.type === PdfAnnotationSubtype.POLYGON"
      :isSelected="false"
      :scale="scale"
      v-bind="preview.data"
    />
    <Polyline
      v-else-if="preview.type === PdfAnnotationSubtype.POLYLINE"
      :isSelected="false"
      :scale="scale"
      v-bind="preview.data"
    />
    <Line
      v-else-if="preview.type === PdfAnnotationSubtype.LINE"
      :isSelected="false"
      :scale="scale"
      v-bind="preview.data"
    />
    <Ink
      v-else-if="preview.type === PdfAnnotationSubtype.INK"
      :isSelected="false"
      :scale="scale"
      v-bind="preview.data"
    />
    <div
      v-else-if="preview.type === PdfAnnotationSubtype.FREETEXT"
      :style="{
        width: '100%',
        height: '100%',
        border: `1px dashed ${preview.data.fontColor || '#000000'}`,
        backgroundColor: 'transparent',
      }"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, CSSProperties } from 'vue';
import { AnyPreviewState } from '@embedpdf/plugin-annotation';
import { PdfAnnotationSubtype } from '@embedpdf/models';
import { Circle, Square, Polygon, Polyline, Line, Ink } from './annotations';

const props = defineProps<{
  preview: AnyPreviewState;
  scale: number;
}>();

const style = computed<CSSProperties>(() => ({
  position: 'absolute',
  left: `${props.preview.bounds.origin.x * props.scale}px`,
  top: `${props.preview.bounds.origin.y * props.scale}px`,
  width: `${props.preview.bounds.size.width * props.scale}px`,
  height: `${props.preview.bounds.size.height * props.scale}px`,
  pointerEvents: 'none',
  zIndex: 10,
}));
</script>
