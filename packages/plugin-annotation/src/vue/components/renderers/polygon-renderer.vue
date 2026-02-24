<template>
  <PolygonVue
    v-bind="currentObject"
    :isSelected="isSelected"
    :scale="scale"
    :onClick="onClick"
    :appearanceActive="appearanceActive"
  />
</template>

<script setup lang="ts">
import { PdfPolygonAnnoObject } from '@embedpdf/models';
import { AnnotationRendererProps } from '../../context/types';
import PolygonVue from '../annotations/polygon.vue';

const { currentObject, isSelected, scale, onClick, appearanceActive } =
  defineProps<AnnotationRendererProps<PdfPolygonAnnoObject>>();
</script>
