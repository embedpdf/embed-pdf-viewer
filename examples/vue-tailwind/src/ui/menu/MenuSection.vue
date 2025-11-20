<template>
  <div :class="isMobile ? 'py-2' : 'py-1'">
    <div
      v-if="item.labelKey || item.label"
      :class="
        isMobile
          ? 'px-4 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500'
          : 'px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500'
      "
    >
      {{ translate(item.labelKey || item.id, { fallback: item.label || item.id }) }}
    </div>
    <MenuItemRenderer
      v-for="(subItem, index) in item.items"
      :key="`${subItem.type}-${index}`"
      :item="subItem"
      :documentId="documentId"
      :onClose="onClose"
      :isMobile="isMobile"
      :onNavigateToSubmenu="onNavigateToSubmenu"
      :responsiveMetadata="responsiveMetadata"
    />
  </div>
</template>

<script setup lang="ts">
import type { MenuItem, ResponsiveMetadata } from '@embedpdf/plugin-ui/vue';
import { useTranslations } from '@embedpdf/plugin-i18n/vue';
import MenuItemRenderer from './MenuItemRenderer.vue';

/**
 * Renders a menu section with optional label and nested items
 */

interface Props {
  item: Extract<MenuItem, { type: 'section' }>;
  documentId: string;
  onClose: () => void;
  isMobile: boolean;
  onNavigateToSubmenu?: (submenuId: string, title: string) => void;
  responsiveMetadata: ResponsiveMetadata | null;
}

const props = defineProps<Props>();

const { translate } = useTranslations(props.documentId);
</script>
