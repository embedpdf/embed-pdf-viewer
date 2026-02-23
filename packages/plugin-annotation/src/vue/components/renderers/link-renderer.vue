<template>
  <LinkVue
    v-bind="currentObject"
    :isSelected="isSelected"
    :scale="scale"
    :onClick="onClick"
    :hasIRT="!!currentObject.inReplyToId"
  />
</template>

<script setup lang="ts">
import { PdfLinkAnnoObject } from '@embedpdf/models';
import { AnnotationRendererProps } from '../../context/types';
import LinkVue from '../annotations/link.vue';

const { currentObject, isSelected, scale, onClick } =
  defineProps<AnnotationRendererProps<PdfLinkAnnoObject>>();
</script>
