<template>
  <div
    v-bind="getUIItemProps(item)"
    :class="isMobile ? 'my-2 border-t border-gray-200' : 'my-1 border-t border-gray-200'"
  />
</template>

<script setup lang="ts">
import type { MenuItem } from '@embedpdf/plugin-ui/vue';
import { getUIItemProps } from '@embedpdf/plugin-ui/vue';

interface Props {
  item: Extract<MenuItem, { type: 'divider' }>;
  isMobile: boolean;
}

defineProps<Props>();
</script>
