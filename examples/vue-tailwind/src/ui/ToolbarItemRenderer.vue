<template>
  <!-- Command Button -->
  <CommandButtonRenderer
    v-if="item.type === 'command-button'"
    :item="item"
    :documentId="documentId"
  />

  <!-- Tab Group -->
  <TabGroupRenderer v-else-if="item.type === 'tab-group'" :item="item" :documentId="documentId" />

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

<script setup lang="ts">
import type { ToolbarItem } from '@embedpdf/plugin-ui/vue';
import CommandButtonRenderer from './renderers/CommandButtonRenderer.vue';
import TabGroupRenderer from './renderers/TabGroupRenderer.vue';
import DividerRenderer from './renderers/DividerRenderer.vue';
import SpacerRenderer from './renderers/SpacerRenderer.vue';
import GroupRenderer from './renderers/GroupRenderer.vue';
import CustomComponentRenderer from './renderers/CustomComponentRenderer.vue';

interface Props {
  item: ToolbarItem;
  documentId: string;
}

defineProps<Props>();
</script>
