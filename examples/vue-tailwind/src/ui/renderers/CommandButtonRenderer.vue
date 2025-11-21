<template>
  <div :class="twMerge(variantClasses, responsiveClasses)" :data-item-id="item.id">
    <CommandButton
      :commandId="item.commandId"
      :documentId="documentId"
      :variant="item.variant"
      :itemId="item.id"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ToolbarItem } from '@embedpdf/plugin-ui/vue';
import { twMerge } from 'tailwind-merge';
import CommandButton from '../../components/CommandButton.vue';

/**
 * Renders a command button
 */

interface Props {
  item: Extract<ToolbarItem, { type: 'command-button' }>;
  documentId: string;
  responsiveClasses: string;
}

const props = defineProps<Props>();

const variantClasses = computed(() => getVariantClasses(props.item.variant));

/**
 * Get variant classes for command buttons
 */
function getVariantClasses(variant?: 'icon' | 'text' | 'icon-text' | 'tab'): string {
  // Tab variant gets special styling
  if (variant === 'tab') {
    return 'toolbar-tab';
  }
  return '';
}
</script>
