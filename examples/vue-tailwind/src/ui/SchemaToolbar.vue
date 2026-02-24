<template>
  <div
    v-if="isOpen"
    v-bind="getUIItemProps(schema)"
    :class="twMerge('flex items-center gap-2', placementClasses, slotClasses, className)"
  >
    <template v-for="item in schema.items" :key="item.id">
      <!-- Command Button -->
      <CommandButtonRenderer
        v-if="item.type === 'command-button'"
        :item="item"
        :documentId="documentId"
      />

      <!-- Tab Group -->
      <TabGroupRenderer
        v-else-if="item.type === 'tab-group'"
        :item="item"
        :documentId="documentId"
      />

      <!-- Divider -->
      <DividerRenderer v-else-if="item.type === 'divider'" :item="item" />

      <!-- Spacer -->
      <SpacerRenderer v-else-if="item.type === 'spacer'" :item="item" />

      <!-- Group -->
      <GroupRenderer v-else-if="item.type === 'group'" :item="item" :documentId="documentId" />

      <!-- Custom -->
      <CustomComponentRenderer
        v-else-if="item.type === 'custom'"
        :item="item"
        :documentId="documentId"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { type ToolbarRendererProps, getUIItemProps } from '@embedpdf/plugin-ui/vue';
import { twMerge } from 'tailwind-merge';
import CommandButtonRenderer from './renderers/CommandButtonRenderer.vue';
import TabGroupRenderer from './renderers/TabGroupRenderer.vue';
import DividerRenderer from './renderers/DividerRenderer.vue';
import SpacerRenderer from './renderers/SpacerRenderer.vue';
import GroupRenderer from './renderers/GroupRenderer.vue';
import CustomComponentRenderer from './renderers/CustomComponentRenderer.vue';

const props = withDefaults(defineProps<ToolbarRendererProps>(), {
  className: '',
});

const isSecondarySlot = computed(() => props.schema.position.slot === 'secondary');
const placementClasses = computed(() => getPlacementClasses(props.schema.position.placement));
const slotClasses = computed(() => (isSecondarySlot.value ? 'bg-[#f1f3f5]' : ''));

function getPlacementClasses(placement: 'top' | 'bottom' | 'left' | 'right'): string {
  switch (placement) {
    case 'top':
      return 'border-b border-gray-300 bg-white px-3 py-2';
    case 'bottom':
      return 'border-t border-gray-300 bg-white px-3 py-2';
    case 'left':
      return 'border-r border-gray-300 bg-white px-2 py-3 flex-col';
    case 'right':
      return 'border-l border-gray-300 bg-white px-2 py-3 flex-col';
  }
}
</script>
