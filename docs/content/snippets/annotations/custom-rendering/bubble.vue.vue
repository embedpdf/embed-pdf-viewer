<!-- CommentBubble.vue -->
<script setup lang="ts">
import type { AnnotationRendererProps } from '@embedpdf/vue/annotation';

defineProps<AnnotationRendererProps>();
</script>

<template>
  <!-- It fills its frame (`width` and `height` 100% in your CSS), so the selection
       outline and the click area match it, and it turns with the annotation. -->
  <div :class="['bubble', { 'bubble--hover': hovered }]">
    {{ annotation.author?.[0] ?? '?' }}
  </div>
</template>
