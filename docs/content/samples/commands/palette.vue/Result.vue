<script setup lang="ts">
import { useCommand } from '@embedpdf/vue/commands';

// A result: its row follows the command, so it greys out the moment the command can't run.
const props = defineProps<{ id: string }>();
const command = useCommand(() => props.id);
</script>

<template>
  <li v-if="command">
    <button type="button" class="result" :disabled="!command.enabled" @click="command.run()">
      <span>{{ command.label }}</span>
      <kbd v-if="command.shortcut" class="shortcut">{{ command.shortcut }}</kbd>
    </button>
  </li>
</template>
