<template>
  <div :class="twMerge(responsiveClasses)" :data-item-id="item.id">
    <ToolbarDivider :orientation="item.orientation" :data-item-id="item.id" />
  </div>
</template>

<script setup lang="ts">
import type { ToolbarItem } from '@embedpdf/plugin-ui/vue';
import { twMerge } from 'tailwind-merge';
import ToolbarDivider from '../../components/ui/ToolbarDivider.vue';

/**
 * Renders a divider
 */

interface Props {
  item: Extract<ToolbarItem, { type: 'divider' }>;
  responsiveClasses: string;
}

defineProps<Props>();
</script>
