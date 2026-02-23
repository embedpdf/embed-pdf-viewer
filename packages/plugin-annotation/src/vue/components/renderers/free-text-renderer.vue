<template>
  <FreeTextVue
    :documentId="documentId"
    :isSelected="isSelected"
    :isEditing="isEditing"
    :annotation="{ ...annotation, object: currentObject }"
    :pageIndex="pageIndex"
    :scale="scale"
    :onClick="onClick"
    :appearanceActive="appearanceActive"
  />
</template>

<script setup lang="ts">
import { PdfFreeTextAnnoObject } from '@embedpdf/models';
import { AnnotationRendererProps } from '../../context/types';
import FreeTextVue from '../annotations/free-text.vue';

const {
  annotation,
  currentObject,
  isSelected,
  isEditing,
  scale,
  pageIndex,
  documentId,
  onClick,
  appearanceActive,
} = defineProps<AnnotationRendererProps<PdfFreeTextAnnoObject>>();
</script>
