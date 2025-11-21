<template>
  <div :class="twMerge(responsiveClasses)" :data-item-id="item.id">
    <component :is="customComponent" v-if="customComponent" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ToolbarItem } from '@embedpdf/plugin-ui/vue';
import { useItemRenderer } from '@embedpdf/plugin-ui/vue';
import { twMerge } from 'tailwind-merge';

/**
 * Renders a custom component from the registry
 */

interface Props {
  item: Extract<ToolbarItem, { type: 'custom' }>;
  documentId: string;
  responsiveClasses: string;
}

const props = defineProps<Props>();

const { renderCustomComponent } = useItemRenderer();

const customComponent = computed(() =>
  renderCustomComponent(props.item.componentId, props.documentId, props.item.props),
);
</script>
