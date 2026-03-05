<template>
  <CaretVue
    v-bind="currentObject"
    :scale="scale"
    :onClick="onClick"
    :appearanceActive="appearanceActive"
  />
</template>

<script setup lang="ts">
import { PdfCaretAnnoObject } from '@embedpdf/models';
import { AnnotationRendererProps } from '../../context/types';
import CaretVue from '../annotations/caret.vue';

const { currentObject, scale, onClick, appearanceActive } =
  defineProps<AnnotationRendererProps<PdfCaretAnnoObject>>();
</script>
