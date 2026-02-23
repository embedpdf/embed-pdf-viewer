<template>
  <SquareVue
    v-bind="currentObject"
    :isSelected="isSelected"
    :scale="scale"
    :onClick="onClick"
    :appearanceActive="appearanceActive"
  />
</template>

<script setup lang="ts">
import { PdfSquareAnnoObject } from '@embedpdf/models';
import { AnnotationRendererProps } from '../../context/types';
import SquareVue from '../annotations/square.vue';

const { currentObject, isSelected, scale, onClick, appearanceActive } =
  defineProps<AnnotationRendererProps<PdfSquareAnnoObject>>();
</script>
