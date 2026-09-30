<!-- ApprovedBadge.vue -->
<script setup lang="ts">
import { computed } from 'vue';
import type { AnnotationRendererProps } from '@embedpdf/vue/annotation';

const props = defineProps<AnnotationRendererProps>();
const rect = computed(() => props.page.transform.pageToViewRect(props.box));
</script>

<template>
  <component :is="native" />
  <div
    :class="['badge', { 'badge--hover': hovered }]"
    :style="{ position: 'absolute', left: `${rect.x + rect.width - 12}px`, top: `${rect.y - 12}px` }"
  >
    ✓
  </div>
</template>
