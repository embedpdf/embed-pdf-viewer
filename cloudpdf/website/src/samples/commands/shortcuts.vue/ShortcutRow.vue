<script setup lang="ts">
import { formatShortcut, useCommand } from '@embedpdf/vue/commands';

// One row of the sheet: the key, and what it does. A command that can't run now is greyed out.
const props = defineProps<{ id: string; shortcut: string }>();
const command = useCommand(() => props.id);
</script>

<template>
  <li v-if="command?.visible" class="row" :data-disabled="!command.enabled || undefined">
    <kbd class="key">{{ formatShortcut(shortcut) }}</kbd>
    <span>{{ command.label }}</span>
  </li>
</template>
