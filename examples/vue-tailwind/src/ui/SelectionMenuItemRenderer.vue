<template>
  <CommandButtonItem v-if="item.type === 'command-button'" :item="item" :documentId="documentId" />
  <div v-else-if="item.type === 'divider'" v-bind="getUIItemProps(item)">
    <ToolbarDivider orientation="vertical" />
  </div>
  <div
    v-else-if="item.type === 'group'"
    v-bind="getUIItemProps(item)"
    :class="`flex items-center gap-${item.gap ?? 1}`"
  >
    <SelectionMenuItemRenderer
      v-for="child in item.items"
      :key="child.id"
      :item="child"
      :documentId="documentId"
      :props="props"
    />
  </div>
</template>

<script setup lang="ts">
import type { SelectionMenuItem, SelectionMenuPropsBase } from '@embedpdf/plugin-ui/vue';
import { getUIItemProps } from '@embedpdf/plugin-ui/vue';
import CommandButtonItem from './CommandButtonItem.vue';
import ToolbarDivider from '../components/ui/ToolbarDivider.vue';

defineProps<{
  item: SelectionMenuItem;
  documentId: string;
  props: SelectionMenuPropsBase;
}>();
</script>
