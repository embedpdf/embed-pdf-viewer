<template>
  <CommandMenuItem
    v-if="item.type === 'command'"
    :item="item"
    :documentId="documentId"
    :onClose="onClose"
    :isMobile="isMobile"
  />
  <SubmenuItem
    v-else-if="item.type === 'submenu'"
    :item="item"
    :documentId="documentId"
    :isMobile="isMobile"
    :onNavigateToSubmenu="onNavigateToSubmenu"
  />
  <MenuDivider v-else-if="item.type === 'divider'" :item="item" :isMobile="isMobile" />
  <MenuSection
    v-else-if="item.type === 'section'"
    :item="item"
    :documentId="documentId"
    :onClose="onClose"
    :isMobile="isMobile"
    :onNavigateToSubmenu="onNavigateToSubmenu"
  />
</template>

<script setup lang="ts">
import type { MenuItem } from '@embedpdf/plugin-ui/vue';
import CommandMenuItem from './CommandMenuItem.vue';
import SubmenuItem from './SubmenuItem.vue';
import MenuDivider from './MenuDivider.vue';
import MenuSection from './MenuSection.vue';

interface Props {
  item: MenuItem;
  documentId: string;
  onClose: () => void;
  isMobile: boolean;
  onNavigateToSubmenu?: (submenuId: string, title: string) => void;
}

defineProps<Props>();
</script>
