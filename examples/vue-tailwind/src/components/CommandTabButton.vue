<template>
  <button
    v-if="command && command.visible"
    :ref="anchorRef"
    @click="handleClick"
    :disabled="command.disabled"
    :class="twMerge(baseClasses, activeClasses, sizeClasses)"
    :aria-label="command.label"
    :title="command.label"
    role="tab"
    :aria-selected="command.active"
  >
    <component
      v-if="variant === 'icon' && IconComponent"
      :is="IconComponent"
      class="h-5 w-5"
      :title="command.label"
      :style="{
        color: iconProps.primaryColor,
        fill: iconProps.secondaryColor,
      }"
    />
    <span v-else class="text-sm font-medium">{{ command.label }}</span>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useCommand } from '@embedpdf/plugin-commands/vue';
import { useRegisterAnchor } from '@embedpdf/plugin-ui/vue';
import { twMerge } from 'tailwind-merge';
import * as Icons from './icons';

/**
 * A tab button that executes a command when clicked.
 * Styled to match the modern tab design with rounded background and active state.
 *
 * Automatically registers itself with the anchor registry so menus can anchor to it.
 */

interface Props {
  commandId: string;
  documentId: string;
  itemId?: string; // Unique ID for this button instance (for anchor registry)
  variant?: 'text' | 'icon';
}

const props = withDefaults(defineProps<Props>(), {
  itemId: undefined,
  variant: 'text',
});

const command = useCommand(props.commandId, props.documentId);

// Register this button with the anchor registry if itemId is provided
const finalItemId = computed(() => props.itemId || props.commandId);
const anchorRef = useRegisterAnchor(props.documentId, finalItemId.value);

// Get the icon component from the command's icon property
const iconName = computed(() => (command.value?.icon ? `${command.value.icon}Icon` : null));
const IconComponent = computed(() => {
  if (!iconName.value) return null;
  return (Icons as any)[iconName.value];
});

const iconProps = computed(() => command.value?.iconProps || {});

const baseClasses = 'rounded transition-colors disabled:cursor-not-allowed disabled:opacity-50';
const activeClasses = computed(() =>
  command.value?.active ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900',
);

const sizeClasses = computed(() => (props.variant === 'icon' ? 'p-1.5' : 'px-4 py-1'));

const handleClick = () => {
  if (command.value) {
    command.value.execute();
  }
};
</script>
