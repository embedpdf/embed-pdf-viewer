<template>
  <StrikeoutVue
    v-bind="currentObject"
    :scale="scale"
    :onClick="onClick"
    :appearanceActive="appearanceActive"
  />
</template>

<script setup lang="ts">
import { PdfStrikeOutAnnoObject } from '@embedpdf/models';
import { AnnotationRendererProps } from '../../context/types';
import StrikeoutVue from '../text-markup/strikeout.vue';

const { currentObject, scale, onClick, appearanceActive } =
  defineProps<AnnotationRendererProps<PdfStrikeOutAnnoObject>>();
</script>
