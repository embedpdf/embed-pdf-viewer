<template>
  <div v-if="item.type === 'command-button'" v-bind="getUIItemProps(item)">
    <CommandButton :commandId="item.commandId" :documentId="documentId" :variant="item.variant" />
  </div>
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
import CommandButton from '../components/CommandButton.vue';
import ToolbarDivider from '../components/ui/ToolbarDivider.vue';

defineProps<{
  item: SelectionMenuItem;
  documentId: string;
  props: SelectionMenuPropsBase;
}>();
</script>
