<!-- SchemaToolbar.vue -->
<template>
  <div
    v-if="isOpen"
    :class="twMerge('flex items-center gap-2', placementClasses, slotClasses, className)"
    :data-toolbar-id="schema.id"
  >
    <template v-for="item in schema.items" :key="item.id">
      <!-- Command Button -->
      <CommandButtonRenderer
        v-if="item.type === 'command-button'"
        :item="item"
        :documentId="documentId"
        :responsiveClasses="getResponsiveClasses(item.id)"
      />

      <!-- Tab Group -->
      <TabGroupRenderer
        v-else-if="item.type === 'tab-group'"
        :item="item"
        :documentId="documentId"
        :responsiveMetadata="responsiveMetadata"
        :responsiveClasses="getResponsiveClasses(item.id)"
      />

      <!-- Divider -->
      <DividerRenderer
        v-else-if="item.type === 'divider'"
        :item="item"
        :responsiveClasses="getResponsiveClasses(item.id)"
      />

      <!-- Spacer -->
      <SpacerRenderer v-else-if="item.type === 'spacer'" :item="item" />

      <!-- Group -->
      <GroupRenderer
        v-else-if="item.type === 'group'"
        :item="item"
        :documentId="documentId"
        :responsiveMetadata="responsiveMetadata"
        :responsiveClasses="getResponsiveClasses(item.id)"
      />

      <!-- Custom -->
      <CustomComponentRenderer
        v-else-if="item.type === 'custom'"
        :item="item"
        :documentId="documentId"
        :responsiveClasses="getResponsiveClasses(item.id)"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { resolveResponsiveMetadata, type ToolbarRendererProps } from '@embedpdf/plugin-ui/vue';
import { useLocale } from '@embedpdf/plugin-i18n/vue';
import { twMerge } from 'tailwind-merge';
import { resolveResponsiveClasses } from './responsive-utils';
import CommandButtonRenderer from './renderers/CommandButtonRenderer.vue';
import TabGroupRenderer from './renderers/TabGroupRenderer.vue';
import DividerRenderer from './renderers/DividerRenderer.vue';
import SpacerRenderer from './renderers/SpacerRenderer.vue';
import GroupRenderer from './renderers/GroupRenderer.vue';
import CustomComponentRenderer from './renderers/CustomComponentRenderer.vue';

const props = withDefaults(defineProps<ToolbarRendererProps>(), {
  className: '',
});

const locale = useLocale();

const responsiveMetadata = computed(() => resolveResponsiveMetadata(props.schema, locale.value));

const isSecondarySlot = computed(() => props.schema.position.slot === 'secondary');
const placementClasses = computed(() => getPlacementClasses(props.schema.position.placement));
const slotClasses = computed(() => (isSecondarySlot.value ? 'bg-[#f1f3f5]' : ''));

// Helper to get responsive classes for an item
const getResponsiveClasses = (itemId: string) => {
  const itemMetadata = responsiveMetadata.value?.items.get(itemId) ?? null;
  return resolveResponsiveClasses(itemMetadata);
};

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
