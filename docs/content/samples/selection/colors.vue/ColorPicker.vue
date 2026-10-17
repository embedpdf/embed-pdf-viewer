<script setup lang="ts">
import { useSelection, useSelectionSettings } from '@embedpdf/vue/selection';

// Each: the selected text and its handles. `null` is the viewer's accent: at 35% for the text.
const COLORS = [
  { name: 'Accent', color: null, handles: null, swatch: '#3858e9' },
  { name: 'Yellow', color: 'rgb(250 204 21 / 0.45)', handles: '#ca8a04', swatch: '#facc15' },
  { name: 'Green', color: 'rgb(34 197 94 / 0.35)', handles: '#16a34a', swatch: '#22c55e' },
  { name: 'Pink', color: 'rgb(236 72 153 / 0.3)', handles: '#db2777', swatch: '#ec4899' },
];

const selection = useSelection();
const current = useSelectionSettings((settings) => settings.color);
</script>

<template>
  <button
    v-for="{ name, color, handles, swatch } in COLORS"
    :key="name"
    type="button"
    class="swatch"
    :aria-label="name"
    :aria-pressed="current === color"
    :style="{ background: swatch }"
    @click="selection.updateSettings({ color, handles: { color: handles } })"
  />
  <button type="button" class="button" @click="selection.resetSettings()">Reset</button>
</template>
