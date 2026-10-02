<script setup lang="ts">
import { useSurface } from '@embedpdf/vue/shell';

// `v-model`: the notes are the app's, so they stay while the panel is closed.
const notes = defineModel<string>({ required: true });
const { isOpen, close } = useSurface('notes');
</script>

<template>
  <aside v-if="isOpen" class="panel" aria-label="Notes">
    <header class="panel-header">
      <h3 class="panel-title">Notes</h3>
      <button type="button" class="close" aria-label="Close" @click="close()">×</button>
    </header>
    <textarea
      v-model="notes"
      class="field notes"
      aria-label="Notes"
      placeholder="Your notes on this document…"
    />
  </aside>
</template>
