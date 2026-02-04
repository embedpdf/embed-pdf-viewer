<template>
  <div v-if="command?.visible" v-bind="getUIItemProps(item)">
    <CommandButton :commandId="item.commandId" :documentId="documentId" :variant="item.variant" />
  </div>
</template>

<script setup lang="ts">
import type { SelectionMenuItem } from '@embedpdf/plugin-ui/vue';
import { getUIItemProps } from '@embedpdf/plugin-ui/vue';
import { useCommand } from '@embedpdf/plugin-commands/vue';
import CommandButton from '../components/CommandButton.vue';

const props = defineProps<{
  item: SelectionMenuItem & { type: 'command-button' };
  documentId: string;
}>();

const command = useCommand(
  () => props.item.commandId,
  () => props.documentId,
);
</script>
