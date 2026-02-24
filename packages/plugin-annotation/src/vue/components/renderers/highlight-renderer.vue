<template>
  <HighlightVue
    v-bind="currentObject"
    :scale="scale"
    :onClick="onClick"
    :appearanceActive="appearanceActive"
  />
</template>

<script setup lang="ts">
import { PdfHighlightAnnoObject } from '@embedpdf/models';
import { AnnotationRendererProps } from '../../context/types';
import HighlightVue from '../text-markup/highlight.vue';

const { currentObject, scale, onClick, appearanceActive } =
  defineProps<AnnotationRendererProps<PdfHighlightAnnoObject>>();
</script>
