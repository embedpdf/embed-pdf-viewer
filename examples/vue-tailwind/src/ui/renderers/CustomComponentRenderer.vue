<template>
  <div v-bind="getUIItemProps(item)">
    <component :is="customComponent" v-if="customComponent" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ToolbarItem } from '@embedpdf/plugin-ui/vue';
import { useItemRenderer, getUIItemProps } from '@embedpdf/plugin-ui/vue';

interface Props {
  item: Extract<ToolbarItem, { type: 'custom' }>;
  documentId: string;
}

const props = defineProps<Props>();

const { renderCustomComponent } = useItemRenderer();

const customComponent = computed(() =>
  renderCustomComponent(props.item.componentId, props.documentId, props.item.props),
);
</script>
