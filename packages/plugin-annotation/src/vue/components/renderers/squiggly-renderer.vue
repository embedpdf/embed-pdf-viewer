<template>
  <SquigglyVue
    v-bind="currentObject"
    :scale="scale"
    :onClick="onClick"
    :appearanceActive="appearanceActive"
  />
</template>

<script setup lang="ts">
import { PdfSquigglyAnnoObject } from '@embedpdf/models';
import { AnnotationRendererProps } from '../../context/types';
import SquigglyVue from '../text-markup/squiggly.vue';

const { currentObject, scale, onClick, appearanceActive } =
  defineProps<AnnotationRendererProps<PdfSquigglyAnnoObject>>();
</script>
