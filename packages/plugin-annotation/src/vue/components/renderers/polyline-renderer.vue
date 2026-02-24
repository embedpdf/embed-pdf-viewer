<template>
  <PolylineVue
    v-bind="currentObject"
    :isSelected="isSelected"
    :scale="scale"
    :onClick="onClick"
    :appearanceActive="appearanceActive"
  />
</template>

<script setup lang="ts">
import { PdfPolylineAnnoObject } from '@embedpdf/models';
import { AnnotationRendererProps } from '../../context/types';
import PolylineVue from '../annotations/polyline.vue';

const { currentObject, isSelected, scale, onClick, appearanceActive } =
  defineProps<AnnotationRendererProps<PdfPolylineAnnoObject>>();
</script>
