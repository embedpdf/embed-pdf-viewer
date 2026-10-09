<script setup lang="ts">
import { ref } from 'vue';
import { Stage } from '@embedpdf/vue/stage';
import { RenderLayer } from '@embedpdf/vue/render';
import { useCommandShortcuts } from '@embedpdf/vue/commands';
import KeyboardHelp from './KeyboardHelp.vue';

// The keys work while focus is inside this viewer, so they leave the rest of the page alone. A
// click anywhere in it gives it focus: `tabindex="-1"` makes it a place for keys, not a stop in the
// Tab order.
const area = ref<HTMLDivElement | null>(null);
useCommandShortcuts({ target: area });
</script>

<template>
  <div ref="area" class="layout" tabindex="-1">
    <KeyboardHelp />
    <Stage class="stage">
      <template #page><RenderLayer /></template>
    </Stage>
  </div>
</template>
