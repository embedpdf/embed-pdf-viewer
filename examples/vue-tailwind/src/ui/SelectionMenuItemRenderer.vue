<template>
  <CommandButton
    v-if="item.type === 'command-button'"
    :commandId="item.commandId"
    :documentId="documentId"
    :variant="item.variant"
  />
  <ToolbarDivider v-else-if="item.type === 'divider'" orientation="vertical" />
  <div v-else-if="item.type === 'group'" :class="`flex items-center gap-${item.gap ?? 1}`">
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
import CommandButton from '../components/CommandButton.vue';
import ToolbarDivider from '../components/ui/ToolbarDivider.vue';

defineProps<{
  item: SelectionMenuItem;
  documentId: string;
  props: SelectionMenuPropsBase;
}>();
</script>
