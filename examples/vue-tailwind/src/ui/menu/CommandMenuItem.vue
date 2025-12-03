<template>
  <button
    v-if="command && command.visible"
    v-bind="getUIItemProps(item)"
    @click="handleClick"
    :disabled="command.disabled"
    :class="twMerge(baseClasses, disabledClasses, activeClasses, 'w-full text-left')"
    role="menuitem"
  >
    <component
      v-if="IconComponent"
      :is="IconComponent"
      :class="isMobile ? 'h-5 w-5' : 'h-4 w-4'"
      :title="command.label"
      :style="{ color: iconProps.primaryColor, fill: iconProps.secondaryColor }"
    />
    <span class="flex-1">{{ command.label }}</span>
    <CheckIcon v-if="command.active" class="h-4 w-4" />
    <span
      v-if="command.shortcuts && command.shortcuts.length > 0 && !isMobile"
      class="text-xs text-gray-400"
    >
      {{ command.shortcuts[0] }}
    </span>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { MenuItem } from '@embedpdf/plugin-ui/vue';
import { getUIItemProps } from '@embedpdf/plugin-ui/vue';
import { useCommand } from '@embedpdf/plugin-commands/vue';
import { twMerge } from 'tailwind-merge';
import * as Icons from '../../components/icons';
import { CheckIcon } from '../../components/icons';

interface Props {
  item: Extract<MenuItem, { type: 'command' }>;
  documentId: string;
  onClose: () => void;
  isMobile: boolean;
}

const props = defineProps<Props>();

const command = useCommand(props.item.commandId, props.documentId);

const iconName = computed(() => (command.value?.icon ? `${command.value.icon}Icon` : null));
const IconComponent = computed(() => {
  if (!iconName.value) return null;
  return (Icons as any)[iconName.value];
});

const iconProps = computed(() => command.value?.iconProps || {});

const baseClasses = computed(() =>
  props.isMobile
    ? 'flex items-center gap-3 px-4 py-3 text-base transition-colors active:bg-gray-100'
    : 'flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-gray-100',
);

const disabledClasses = computed(() =>
  command.value?.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
);

const activeClasses = computed(() =>
  command.value?.active ? 'bg-blue-50 text-blue-600' : 'text-gray-700',
);

const handleClick = () => {
  if (command.value && !command.value.disabled) {
    command.value.execute();
    props.onClose();
  }
};
</script>
