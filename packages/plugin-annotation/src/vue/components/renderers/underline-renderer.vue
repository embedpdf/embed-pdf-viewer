<template>
  <UnderlineVue v-bind="currentObject" :scale="scale" :onClick="onClick" />
</template>

<script setup lang="ts">
import { PdfUnderlineAnnoObject } from '@embedpdf/models';
import { AnnotationRendererProps } from '../../context/types';
import UnderlineVue from '../text-markup/underline.vue';

const { currentObject, scale, onClick } =
  defineProps<AnnotationRendererProps<PdfUnderlineAnnoObject>>();
</script>
