<script setup lang="ts">
import { computed } from 'vue';
import type { AnnotationRendererProps } from '@embedpdf/vue/annotation';

// A note drawn as your app's comment bubble, the author's initials in it. It
// fills its frame, so the selection outline and the click area match it, and
// it turns with the annotation: a note stays upright on a turned page.
const props = defineProps<AnnotationRendererProps>();

const initials = computed(() =>
  (props.annotation.author ?? '?')
    .split(' ')
    .map((word) => word[0])
    .join(''),
);
</script>

<template>
  <div :class="['bubble', { 'bubble--hover': hovered }]">{{ initials }}</div>
</template>
