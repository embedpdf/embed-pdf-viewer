<template>
  <ToolbarButton
    :ref="anchorRef"
    @click="handleClick"
    :isActive="command?.active"
    :disabled="command?.disabled || !command?.visible"
    :aria-label="command?.label"
    :title="command?.label"
    :class="className"
  >
    <template v-if="variant === 'text'">
      <span class="text-sm">{{ command?.label }}</span>
    </template>
    <template v-else-if="variant === 'icon-text'">
      <component
        v-if="IconComponent"
        :is="IconComponent"
        :class="twMerge('mr-2 h-5 w-5', iconProps.className)"
        :title="command?.label"
        :style="{ color: iconProps.primaryColor }"
      />
      <span>{{ command?.label }}</span>
    </template>
    <template v-else-if="variant === 'tab'">
      <span class="px-3 py-1">{{ command?.label }}</span>
    </template>
    <template v-else>
      <!-- Default: icon only -->
      <component
        v-if="IconComponent"
        :is="IconComponent"
        :class="twMerge('h-5 w-5', iconProps.className)"
        :title="command?.label"
        :style="{
          color: iconProps.primaryColor,
          fill: iconProps.secondaryColor,
        }"
      />
      <span v-else>{{ command?.label }}</span>
    </template>
  </ToolbarButton>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useCommand } from '@embedpdf/plugin-commands/vue';
import { useRegisterAnchor } from '@embedpdf/plugin-ui/vue';
import { twMerge } from 'tailwind-merge';
import ToolbarButton from './ui/ToolbarButton.vue';
import * as Icons from './icons';

/**
 * A button that executes a command when clicked.
 * Uses the useCommand hook to get the command state and execution function.
 * The icon is automatically retrieved from the command definition.
 *
 * Automatically registers itself with the anchor registry so menus can anchor to it.
 */

interface Props {
  commandId: string;
  documentId: string;
  variant?: 'icon' | 'text' | 'icon-text' | 'tab';
  itemId?: string; // Unique ID for this button instance (for anchor registry)
  className?: string;
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'icon',
  itemId: undefined,
  className: undefined,
});

const command = useCommand(props.commandId, props.documentId);

// Register this button with the anchor registry if itemId is provided
// This allows menus to anchor to it when opened via UI state changes
const finalItemId = computed(() => props.itemId || props.commandId);
const anchorRef = useRegisterAnchor(props.documentId, finalItemId.value);

// Get the icon component from the command's icon property
const iconName = computed(() => (command.value?.icon ? `${command.value.icon}Icon` : null));
const IconComponent = computed(() => {
  if (!iconName.value) return null;
  return (Icons as any)[iconName.value];
});

// Get iconProps if available (for dynamic colors, etc.)
const iconProps = computed(() => command.value?.iconProps || {});

const handleClick = () => {
  if (command.value) {
    command.value.execute();
  }
};
</script>
