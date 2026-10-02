<!--
  The default command button: a plain <button> with the command's label in
  every variant (icons are the app's). Pressed when the command is active,
  disabled when it can't run.
-->
<script setup lang="ts">
import type { ResolvedCommand } from '@embedpdf/plugin-commands/contract';
import { ACTIVE, BORDER } from './paint';

defineProps<{
  command: ResolvedCommand;
  run: () => void;
}>();
</script>

<template>
  <button
    type="button"
    :disabled="!command.enabled"
    :aria-pressed="command.active || undefined"
    :aria-haspopup="command.menu ? 'menu' : undefined"
    :title="command.label"
    :style="{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
      padding: '4px 8px',
      whiteSpace: 'nowrap',
      color: 'inherit',
      font: 'inherit',
      background: command.active ? ACTIVE : 'transparent',
      border: `1px solid ${BORDER}`,
      borderRadius: '4px',
      cursor: command.enabled ? 'pointer' : 'default',
      opacity: command.enabled ? 1 : 0.4,
    }"
    @click="run()"
  >
    {{ command.label }}
  </button>
</template>
