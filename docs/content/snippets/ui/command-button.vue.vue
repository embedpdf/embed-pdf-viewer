<script setup lang="ts">
import { useCommand } from '@embedpdf/vue/commands';
import Icon from './Icon.vue';

const props = defineProps<{ id: string }>();
const command = useCommand(() => props.id);
</script>

<template>
  <button
    v-if="command?.visible"
    :disabled="!command.enabled"
    :aria-pressed="command.active"
    @click="command.run()"
  >
    <Icon :name="command.icon" />
    {{ command.label }}
    <kbd v-if="command.shortcut">{{ command.shortcut }}</kbd>
  </button>
</template>
