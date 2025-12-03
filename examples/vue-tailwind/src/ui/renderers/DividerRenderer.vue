<template>
  <div v-bind="getUIItemProps(item)">
    <ToolbarDivider :orientation="item.orientation" />
  </div>
</template>

<script setup lang="ts">
import type { ToolbarItem } from '@embedpdf/plugin-ui/vue';
import { getUIItemProps } from '@embedpdf/plugin-ui/vue';
import ToolbarDivider from '../../components/ui/ToolbarDivider.vue';

interface Props {
  item: Extract<ToolbarItem, { type: 'divider' }>;
}

defineProps<Props>();
</script>
