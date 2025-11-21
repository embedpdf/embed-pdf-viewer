<template>
  <!-- Command Button -->
  <CommandButtonRenderer
    v-if="item.type === 'command-button'"
    :item="item"
    :documentId="documentId"
    :responsiveClasses="responsiveClasses"
  />

  <!-- Tab Group -->
  <TabGroupRenderer
    v-else-if="item.type === 'tab-group'"
    :item="item"
    :documentId="documentId"
    :responsiveMetadata="responsiveMetadata"
    :responsiveClasses="responsiveClasses"
  />

  <!-- Divider -->
  <DividerRenderer
    v-else-if="item.type === 'divider'"
    :item="item"
    :responsiveClasses="responsiveClasses"
  />

  <!-- Spacer -->
  <SpacerRenderer v-else-if="item.type === 'spacer'" :item="item" />

  <!-- Group -->
  <GroupRenderer
    v-else-if="item.type === 'group'"
    :item="item"
    :documentId="documentId"
    :responsiveMetadata="responsiveMetadata"
    :responsiveClasses="responsiveClasses"
  />

  <!-- Custom -->
  <CustomComponentRenderer
    v-else-if="item.type === 'custom'"
    :item="item"
    :documentId="documentId"
    :responsiveClasses="responsiveClasses"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ToolbarItem, ResponsiveMetadata } from '@embedpdf/plugin-ui/vue';
import { resolveResponsiveClasses } from './responsive-utils';
import CommandButtonRenderer from './renderers/CommandButtonRenderer.vue';
import TabGroupRenderer from './renderers/TabGroupRenderer.vue';
import DividerRenderer from './renderers/DividerRenderer.vue';
import SpacerRenderer from './renderers/SpacerRenderer.vue';
import GroupRenderer from './renderers/GroupRenderer.vue';
import CustomComponentRenderer from './renderers/CustomComponentRenderer.vue';

/**
 * Renders a single toolbar item based on its type
 */

interface Props {
  item: ToolbarItem;
  documentId: string;
  responsiveMetadata: ResponsiveMetadata | null;
}

const props = defineProps<Props>();

const itemMetadata = computed(() => props.responsiveMetadata?.items.get(props.item.id) ?? null);
const responsiveClasses = computed(() => resolveResponsiveClasses(itemMetadata.value));
</script>
