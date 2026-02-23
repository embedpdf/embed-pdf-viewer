<template>
  <CircleVue
    v-bind="currentObject"
    :isSelected="isSelected"
    :scale="scale"
    :onClick="onClick"
    :appearanceActive="appearanceActive"
  />
</template>

<script setup lang="ts">
import { PdfCircleAnnoObject } from '@embedpdf/models';
import { AnnotationRendererProps } from '../../context/types';
import CircleVue from '../annotations/circle.vue';

const { currentObject, isSelected, scale, onClick, appearanceActive } =
  defineProps<AnnotationRendererProps<PdfCircleAnnoObject>>();
</script>
