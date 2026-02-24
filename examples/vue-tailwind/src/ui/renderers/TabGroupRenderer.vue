<template>
  <div
    v-bind="getUIItemProps(item)"
    :class="twMerge('flex items-center', alignmentClass)"
    role="tablist"
  >
    <div class="flex rounded-lg bg-gray-100 p-1">
      <div v-for="tab in item.tabs" :key="tab.id" v-bind="getUIItemProps(tab)">
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
import type { ToolbarItem } from '@embedpdf/plugin-ui/vue';
import { getUIItemProps } from '@embedpdf/plugin-ui/vue';
import { twMerge } from 'tailwind-merge';
import CommandTabButton from '../../components/CommandTabButton.vue';

interface Props {
  item: Extract<ToolbarItem, { type: 'tab-group' }>;
  documentId: string;
}

const props = defineProps<Props>();

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
