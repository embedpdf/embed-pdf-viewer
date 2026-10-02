<script setup lang="ts">
import { useCommand } from '@embedpdf/vue/commands';

const props = defineProps<{ id: string }>();
const command = useCommand(() => props.id);
</script>

<template>
  <button
    v-if="command?.visible"
    type="button"
    class="button"
    :disabled="!command.enabled"
    :aria-pressed="command.active"
    @click="command.run()"
  >
    {{ command.label }}
  </button>
</template>
