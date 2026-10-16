<script setup lang="ts">
import { useRichTextEditor } from '@embedpdf/vue/annotation';
import type { AnnotationRendererProps } from '@embedpdf/vue/annotation';

// Your own text box, in your app's look: it fills its frame, which the layer
// places and turns like the text box. The element inside is the editor and
// fills the box, so the box draws the fill, border and padding.
const props = defineProps<AnnotationRendererProps>();

const { ref: editorRef, editing, style } = useRichTextEditor(() => props.annotation);
</script>

<template>
  <div :class="['text-box', { editing }]">
    <div :ref="editorRef" :style="style" />
  </div>
</template>
