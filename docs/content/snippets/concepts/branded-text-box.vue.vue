<script setup lang="ts">
import { useRichTextEditor, type AnnotationRendererProps } from '@embedpdf/vue/annotation';

const props = defineProps<AnnotationRendererProps>();

const { ref: editorRef, editing, style } = useRichTextEditor(() => props.annotation);
</script>

<template>
  <!-- The element fills its frame (`width` and `height` 100% in your CSS). -->
  <div :ref="editorRef" :class="['text-box', { editing }]" :style="style" />
</template>
