<template>
  <InkVue
    v-bind="currentObject"
    :isSelected="isSelected"
    :scale="scale"
    :onClick="onClick"
    :appearanceActive="appearanceActive"
  />
</template>

<script setup lang="ts">
import { PdfInkAnnoObject } from '@embedpdf/models';
import { AnnotationRendererProps } from '../../context/types';
import InkVue from '../annotations/ink.vue';

const { currentObject, isSelected, scale, onClick, appearanceActive } =
  defineProps<AnnotationRendererProps<PdfInkAnnoObject>>();
</script>
