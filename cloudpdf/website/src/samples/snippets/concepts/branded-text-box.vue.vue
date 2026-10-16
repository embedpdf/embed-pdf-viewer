<script setup lang="ts">
import { useRichTextEditor, type AnnotationRendererProps } from '@embedpdf/vue/annotation';

const props = defineProps<AnnotationRendererProps>();

const { ref: editorRef, editing, style } = useRichTextEditor(() => props.annotation);
</script>

<template>
  <!-- The box fills its frame (`width` and `height` 100% in your CSS) and draws it; the
       editor inside fills the box. -->
  <div :class="['text-box', { editing }]">
    <div :ref="editorRef" :style="style" />
  </div>
</template>
