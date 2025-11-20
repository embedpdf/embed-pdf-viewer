<template>
  <div :class="item.flex ? 'flex-1' : 'w-4'" :data-item-id="item.id" aria-hidden="true" />
</template>

<script setup lang="ts">
import type { ToolbarItem } from '@embedpdf/plugin-ui/vue';

/**
 * Renders a spacer
 */

interface Props {
  item: Extract<ToolbarItem, { type: 'spacer' }>;
}

defineProps<Props>();
</script>
