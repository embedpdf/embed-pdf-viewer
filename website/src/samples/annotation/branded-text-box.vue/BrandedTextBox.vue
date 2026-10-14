<script setup lang="ts">
import { useRichTextEditor } from '@embedpdf/vue/annotation';
import type { AnnotationRendererProps } from '@embedpdf/vue/annotation';

// Your own text box: the element is the editor, in your app's look. It fills
// its frame, which the layer places and turns like the text box.
const props = defineProps<AnnotationRendererProps>();

const { ref: editorRef, editing, style } = useRichTextEditor(() => props.annotation);
</script>

<template>
  <div :ref="editorRef" :class="['text-box', { editing }]" :style="style" />
</template>
