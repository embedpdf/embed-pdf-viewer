<script setup lang="ts">
import { useSearch, useSearchSettings } from '@embedpdf/vue/search';

// Each pair: every match, and the active one.
const COLORS = [
  { name: 'Yellow', color: '#ffd500', activeColor: '#ff9632' },
  { name: 'Blue', color: '#a5d8ff', activeColor: '#4c9bff' },
  { name: 'Green', color: '#b2f2bb', activeColor: '#40c057' },
  { name: 'Pink', color: '#fcc2d7', activeColor: '#f06595' },
];

const search = useSearch();
const current = useSearchSettings((settings) => settings.highlight.color);

// Something to highlight.
void search.search({ text: 'PDF' });
</script>

<template>
  <button
    v-for="{ name, color, activeColor } in COLORS"
    :key="name"
    type="button"
    class="swatch"
    :aria-label="name"
    :aria-pressed="current === color"
    :style="{ background: `linear-gradient(135deg, ${color} 50%, ${activeColor} 50%)` }"
    @click="search.updateSettings({ highlight: { color, activeColor } })"
  />
  <button type="button" class="button" @click="search.resetSettings()">Reset</button>
</template>
