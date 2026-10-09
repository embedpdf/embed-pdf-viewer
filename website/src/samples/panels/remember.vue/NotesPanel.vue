<script setup lang="ts">
import { useSurface } from '@embedpdf/vue/shell';

const { isOpen } = useSurface('notes');
</script>

<template>
  <aside v-if="isOpen" class="panel" aria-label="Notes">
    <h3 class="panel-title">Notes</h3>
    <textarea class="notes" aria-label="Notes" placeholder="Your notes on this document…" />
  </aside>
</template>
