<template>
  <div
    v-bind="getUIItemProps(item)"
    :class="twMerge('flex items-center', gapClass, alignmentClass)"
  >
    <ToolbarItemRenderer
      v-for="childItem in item.items"
      :key="childItem.id"
      :item="childItem"
      :documentId="documentId"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ToolbarItem } from '@embedpdf/plugin-ui/vue';
import { getUIItemProps } from '@embedpdf/plugin-ui/vue';
import { twMerge } from 'tailwind-merge';
import ToolbarItemRenderer from '../ToolbarItemRenderer.vue';

interface Props {
  item: Extract<ToolbarItem, { type: 'group' }>;
  documentId: string;
}

const props = defineProps<Props>();

const gapClass = computed(() => (props.item.gap ? `gap-${props.item.gap}` : 'gap-2'));
const alignmentClass = computed(() => getAlignmentClass(props.item.alignment));

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
