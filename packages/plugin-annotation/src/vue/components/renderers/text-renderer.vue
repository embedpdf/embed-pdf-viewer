<template>
  <TextVue
    :isSelected="isSelected"
    :color="currentObject.strokeColor ?? currentObject.color"
    :opacity="currentObject.opacity"
    :onClick="onClick"
    :appearanceActive="appearanceActive"
  />
</template>

<script setup lang="ts">
import { PdfTextAnnoObject } from '@embedpdf/models';
import { AnnotationRendererProps } from '../../context/types';
import TextVue from '../annotations/text.vue';

const { currentObject, isSelected, onClick, appearanceActive } =
  defineProps<AnnotationRendererProps<PdfTextAnnoObject>>();
</script>
