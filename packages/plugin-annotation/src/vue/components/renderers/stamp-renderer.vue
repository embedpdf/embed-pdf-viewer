<template>
  <StampVue
    :isSelected="isSelected"
    :annotation="annotation"
    :documentId="documentId"
    :pageIndex="pageIndex"
    :scale="scale"
    :onClick="onClick"
  />
</template>

<script setup lang="ts">
import { PdfStampAnnoObject } from '@embedpdf/models';
import { AnnotationRendererProps } from '../../context/types';
import StampVue from '../annotations/stamp.vue';

const { annotation, isSelected, documentId, pageIndex, scale, onClick } =
  defineProps<AnnotationRendererProps<PdfStampAnnoObject>>();
</script>
