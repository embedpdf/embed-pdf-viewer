<template>
  <LineVue
    v-bind="currentObject"
    :isSelected="isSelected"
    :scale="scale"
    :onClick="onClick"
    :appearanceActive="appearanceActive"
  />
</template>

<script setup lang="ts">
import { PdfLineAnnoObject } from '@embedpdf/models';
import { AnnotationRendererProps } from '../../context/types';
import LineVue from '../annotations/line.vue';

const { currentObject, isSelected, scale, onClick, appearanceActive } =
  defineProps<AnnotationRendererProps<PdfLineAnnoObject>>();
</script>
