<script setup lang="ts">
import { useCommand } from '@embedpdf/vue/commands';

// One button, drawn from its command: the label, the shortcut, and whether it can run now.
const props = defineProps<{ id: string }>();
const command = useCommand(() => props.id);
</script>

<template>
  <button
    v-if="command?.visible"
    type="button"
    class="button"
    :title="command.label"
    :disabled="!command.enabled"
    :aria-pressed="command.active"
    @click="command.run()"
  >
    {{ command.label }}
    <kbd v-if="command.shortcut" class="shortcut">{{ command.shortcut }}</kbd>
  </button>
</template>
