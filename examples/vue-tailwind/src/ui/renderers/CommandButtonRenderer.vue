<template>
  <div v-bind="getUIItemProps(item)">
    <CommandButton
      :commandId="item.commandId"
      :documentId="documentId"
      :variant="item.variant"
      :itemId="item.id"
    />
  </div>
</template>

<script setup lang="ts">
import type { ToolbarItem } from '@embedpdf/plugin-ui/vue';
import { getUIItemProps } from '@embedpdf/plugin-ui/vue';
import CommandButton from '../../components/CommandButton.vue';

interface Props {
  item: Extract<ToolbarItem, { type: 'command-button' }>;
  documentId: string;
}

defineProps<Props>();
</script>
