<template>
  <component
    :is="rendererComponent"
    v-if="rendererComponent"
    :item="item"
    :documentId="documentId"
    :onClose="onClose"
    :isMobile="isMobile"
    :onNavigateToSubmenu="onNavigateToSubmenu"
    :responsiveMetadata="responsiveMetadata"
    :responsiveClasses="responsiveClasses"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { MenuItem, ResponsiveMetadata } from '@embedpdf/plugin-ui/vue';
import { resolveResponsiveClasses } from '../responsive-utils';
import CommandMenuItem from './CommandMenuItem.vue';
import SubmenuItem from './SubmenuItem.vue';
import MenuDivider from './MenuDivider.vue';
import MenuSection from './MenuSection.vue';

/**
 * Renders a single menu item based on its type
 */

interface Props {
  item: MenuItem;
  documentId: string;
  onClose: () => void;
  isMobile: boolean;
  onNavigateToSubmenu?: (submenuId: string, title: string) => void;
  responsiveMetadata: ResponsiveMetadata | null;
}

const props = defineProps<Props>();

const itemMetadata = computed(() => props.responsiveMetadata?.items.get(props.item.id) ?? null);
const responsiveClasses = computed(() => resolveResponsiveClasses(itemMetadata.value));

const rendererComponent = computed(() => {
  switch (props.item.type) {
    case 'command':
      return CommandMenuItem;
    case 'submenu':
      return SubmenuItem;
    case 'divider':
      return MenuDivider;
    case 'section':
      return MenuSection;
    default:
      return null;
  }
});
</script>
