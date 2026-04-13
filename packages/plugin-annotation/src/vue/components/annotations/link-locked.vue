<script lang="ts">
export default { inheritAttrs: false };
</script>

<script setup lang="ts">
import { PdfLinkAnnoObject } from '@embedpdf/models';
import { AnnotationRendererProps } from '../../context/types';
import { useAnnotationCapability } from '../../hooks';

const props = defineProps<AnnotationRendererProps<PdfLinkAnnoObject>>();

const { provides } = useAnnotationCapability();

const handleClick = () => {
  const target = props.annotation.object.target;
  if (!target || !provides.value) return;
  provides.value.forDocument(props.documentId).navigateTarget(target);
};
</script>

<template>
  <div
    @click="handleClick"
    :style="{
      width: '100%',
      height: '100%',
      cursor: 'pointer',
      pointerEvents: 'auto',
    }"
  />
</template>
