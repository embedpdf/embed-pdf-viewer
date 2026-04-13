<script setup lang="ts">
import type { PdfWidgetAnnoObject } from '@embedpdf/models';
import type { AnnotationRendererProps } from '@embedpdf/plugin-annotation/vue';
import { useFormWidgetState } from '../../hooks/use-form-widget-state';
import RenderWidget from '../render-widget.vue';

const props = defineProps<AnnotationRendererProps<PdfWidgetAnnoObject>>();
const ws = useFormWidgetState(props);
</script>

<template>
  <div
    :style="{
      width: '100%',
      height: '100%',
      overflow: 'hidden',
      pointerEvents: 'auto',
    }"
  >
    <RenderWidget
      :pageIndex="ws.pageIndex.value"
      :annotation="ws.annotation.value"
      :scaleFactor="ws.scale.value"
      :renderKey="ws.renderKey.value"
      :style="{ pointerEvents: 'none' }"
    />
  </div>
</template>
