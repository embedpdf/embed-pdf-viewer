<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { PdfWidgetAnnoObject } from '@embedpdf/models';
import { ignore, PdfErrorCode } from '@embedpdf/models';
import { useFormCapability } from '../hooks/use-form';
import { deepToRaw } from '@embedpdf/utils/vue';

const props = withDefaults(
  defineProps<{
    pageIndex: number;
    annotation: PdfWidgetAnnoObject;
    scaleFactor?: number;
    renderKey?: number;
    style?: Record<string, string>;
  }>(),
  {
    scaleFactor: 1,
    renderKey: 0,
    style: () => ({}),
  },
);

const { provides: formProvides } = useFormCapability();
const imageUrl = ref<string | null>(null);
let prevUrl: string | null = null;

const annotationId = computed(() => props.annotation.id);
const rectWidth = computed(() => props.annotation.rect.size.width);
const rectHeight = computed(() => props.annotation.rect.size.height);

watch(
  () => [
    props.pageIndex,
    props.scaleFactor,
    props.renderKey,
    annotationId.value,
    rectWidth.value,
    rectHeight.value,
    formProvides.value,
  ],
  (_, __, onCleanup) => {
    const fp = formProvides.value;
    if (!fp) return;

    const task = fp.renderWidget({
      pageIndex: props.pageIndex,
      annotation: deepToRaw(props.annotation),
      options: {
        scaleFactor: props.scaleFactor,
        dpr: window.devicePixelRatio,
      },
    });

    task.wait((blob) => {
      const url = URL.createObjectURL(blob);
      if (prevUrl) {
        URL.revokeObjectURL(prevUrl);
      }
      prevUrl = url;
      imageUrl.value = url;
    }, ignore);

    onCleanup(() => {
      task.abort({
        code: PdfErrorCode.Cancelled,
        message: 'canceled render task',
      });
      if (prevUrl) {
        URL.revokeObjectURL(prevUrl);
        prevUrl = null;
      }
    });
  },
  { immediate: true },
);
</script>

<template>
  <img
    v-if="imageUrl"
    :src="imageUrl"
    alt=""
    :style="{ width: '100%', height: '100%', display: 'block', ...style }"
  />
</template>
