<template>
  <div v-bind="getUIItemProps(item)" :class="item.flex ? 'flex-1' : 'w-4'" aria-hidden="true" />
</template>

<script setup lang="ts">
import type { ToolbarItem } from '@embedpdf/plugin-ui/vue';
import { getUIItemProps } from '@embedpdf/plugin-ui/vue';

interface Props {
  item: Extract<ToolbarItem, { type: 'spacer' }>;
}

defineProps<Props>();
</script>
