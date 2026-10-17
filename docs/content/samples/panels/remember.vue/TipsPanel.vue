<script setup lang="ts">
import { useSurface } from '@embedpdf/vue/shell';

const TIPS = [
  'Ctrl or ⌘ and scroll to zoom',
  'Pinch to zoom on a touch screen',
  'Drag between pages to scroll',
];

const { isOpen } = useSurface('tips');
</script>

<template>
  <aside v-if="isOpen" class="panel" aria-label="Tips">
    <h3 class="panel-title">Tips</h3>
    <ul class="tips">
      <li v-for="tip in TIPS" :key="tip">{{ tip }}</li>
    </ul>
  </aside>
</template>
