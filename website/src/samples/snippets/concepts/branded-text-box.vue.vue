<script setup lang="ts">
import { computed } from 'vue';
import { useRichTextEditor, type AnnotationRendererProps } from '@embedpdf/vue/annotation';

const props = defineProps<AnnotationRendererProps>();

const { ref: editorRef, editing, style } = useRichTextEditor(
  () => props.annotation,
  () => props.page,
);
const rect = computed(() => props.page.transform.pageToViewRect(props.box));
</script>

<template>
  <div
    :ref="editorRef"
    :class="['text-box', { editing }]"
    :style="[
      {
        position: 'absolute',
        left: `${rect.x}px`,
        top: `${rect.y}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      },
      style,
    ]"
  />
</template>
