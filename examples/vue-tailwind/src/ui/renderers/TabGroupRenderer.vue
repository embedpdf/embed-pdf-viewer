<template>
  <div
    :class="twMerge('flex items-center', alignmentClass, responsiveClasses)"
    :data-item-id="item.id"
    role="tablist"
  >
    <div class="flex rounded-lg bg-gray-100 p-1">
      <div
        v-for="tab in item.tabs"
        :key="tab.id"
        :class="twMerge(getTabResponsiveClasses(tab.id))"
        :data-tab-id="tab.id"
      >
        <CommandTabButton
          v-if="tab.commandId"
          :commandId="tab.commandId"
          :documentId="documentId"
          :itemId="tab.id"
          :variant="tab.variant === 'icon' ? 'icon' : 'text'"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ToolbarItem, ResponsiveMetadata } from '@embedpdf/plugin-ui/vue';
import { twMerge } from 'tailwind-merge';
import { resolveResponsiveClasses } from '../responsive-utils';
import CommandTabButton from '../../components/CommandTabButton.vue';

/**
 * Renders a tab group
 */

interface Props {
  item: Extract<ToolbarItem, { type: 'tab-group' }>;
  documentId: string;
  responsiveClasses: string;
  responsiveMetadata: ResponsiveMetadata | null;
}

const props = defineProps<Props>();

const alignmentClass = computed(() => getAlignmentClass(props.item.alignment));

function getTabResponsiveClasses(tabId: string): string {
  const tabMetadata = props.responsiveMetadata?.items.get(tabId) ?? null;
  return resolveResponsiveClasses(tabMetadata);
}

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
