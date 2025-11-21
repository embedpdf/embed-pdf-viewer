<template>
  <button
    @click="handleClick"
    :class="
      twMerge(baseClasses, responsiveClasses, 'w-full cursor-pointer text-left text-gray-700')
    "
    role="menuitem"
  >
    <component v-if="IconComponent" :is="IconComponent" :class="isMobile ? 'h-5 w-5' : 'h-4 w-4'" />
    <span class="flex-1">
      {{ translate(item.labelKey || item.id, { fallback: item.label || item.id }) }}
    </span>
    <ChevronRightIcon :class="isMobile ? 'h-5 w-5' : 'h-4 w-4'" />
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { MenuItem } from '@embedpdf/plugin-ui/vue';
import { useTranslations } from '@embedpdf/plugin-i18n/vue';
import { twMerge } from 'tailwind-merge';
import * as Icons from '../../components/icons';
import { ChevronRightIcon } from '../../components/icons';

/**
 * Renders a submenu item
 */

interface Props {
  item: Extract<MenuItem, { type: 'submenu' }>;
  documentId: string;
  isMobile: boolean;
  onNavigateToSubmenu?: (submenuId: string, title: string) => void;
  responsiveClasses: string;
}

const props = defineProps<Props>();

const { translate } = useTranslations(props.documentId);

const iconName = computed(() => (props.item.icon ? `${props.item.icon}Icon` : null));
const IconComponent = computed(() => {
  if (!iconName.value) return null;
  return (Icons as any)[iconName.value];
});

const baseClasses = computed(() =>
  props.isMobile
    ? 'flex items-center gap-3 px-4 py-3 text-base transition-colors active:bg-gray-100'
    : 'flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-gray-100',
);

const handleClick = () => {
  if (props.onNavigateToSubmenu) {
    props.onNavigateToSubmenu(
      props.item.menuId,
      translate(props.item.labelKey || props.item.id, {
        fallback: props.item.label || props.item.id,
      }),
    );
  }
};
</script>
