<template>
  <div
    :class="twMerge('flex items-center', gapClass, alignmentClass, responsiveClasses)"
    :data-item-id="item.id"
  >
    <ToolbarItemRenderer
      v-for="childItem in item.items"
      :key="childItem.id"
      :item="childItem"
      :documentId="documentId"
      :responsiveMetadata="responsiveMetadata"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ToolbarItem, ResponsiveMetadata } from '@embedpdf/plugin-ui/vue';
import { twMerge } from 'tailwind-merge';
import ToolbarItemRenderer from '../ToolbarItemRenderer.vue';

/**
 * Renders a group of items
 */

interface Props {
  item: Extract<ToolbarItem, { type: 'group' }>;
  documentId: string;
  responsiveClasses: string;
  responsiveMetadata: ResponsiveMetadata | null;
}

const props = defineProps<Props>();

const gapClass = computed(() => (props.item.gap ? `gap-${props.item.gap}` : 'gap-2'));
const alignmentClass = computed(() => getAlignmentClass(props.item.alignment));

/**
 * Get alignment class for groups
 */
function getAlignmentClass(alignment?: 'start' | 'center' | 'end'): string {
  switch (alignment) {
    case 'start':
      return 'justify-start';
    case 'center':
      return 'justify-center';
    case 'end':
      return 'justify-end';
    default:
      return 'justify-start';
  }
}
</script>
