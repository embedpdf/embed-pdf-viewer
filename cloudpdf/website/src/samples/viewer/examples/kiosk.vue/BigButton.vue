<script setup lang="ts">
import { useCommand } from '@cloudpdf/viewer-vue';
import { ICONS } from './icons';

// One of the kiosk's commands, drawn big enough for a finger.
const props = defineProps<{ id: string; primary?: boolean }>();
const command = useCommand(() => props.id);
</script>

<template>
  <button
    type="button"
    :class="primary ? 'kiosk-button primary' : 'kiosk-button'"
    :disabled="!command.enabled"
    @click="command.run()"
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path v-for="d in ICONS[command.icon ?? ''] ?? []" :key="d" :d="d" />
    </svg>
    {{ command.label }}
  </button>
</template>
