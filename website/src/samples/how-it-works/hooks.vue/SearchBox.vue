<script setup lang="ts">
import { ref, watch } from 'vue';
import { useSearch, useSearchEvent, useSearchSettings, useSearchState } from '@embedpdf/vue/search';

const colors = ['#ffd500', '#7dd3fc', '#86efac'];

// The API: what search can do.
const search = useSearch();
// The data to show: the template updates when the count or the active match changes.
const { hitCount, activeHitIndex } = useSearchState();
// The settings: the template updates when the highlight color changes.
const color = useSearchSettings((settings) => settings.highlight.color);
const text = ref('PDF');
const announcement = ref('');

// A call to your function when something happens.
useSearchEvent(
  (search) => search.onCompleted,
  ({ hitCount }) => (announcement.value = `The search finished with ${hitCount} matches.`),
);

watch(text, (value) => void search.search({ text: value }), { immediate: true });
</script>

<template>
  <div class="toolbar">
    <input v-model="text" class="field" type="search" aria-label="Search" />
    <output class="readout">
      {{ hitCount > 0 ? `${activeHitIndex + 1} of ${hitCount}` : 'No matches' }}
    </output>
    <button type="button" class="button" @click="search.nextHit()">Next</button>
    <button
      v-for="swatch in colors"
      :key="swatch"
      type="button"
      class="swatch"
      :aria-label="`Highlight in ${swatch}`"
      :aria-pressed="color === swatch"
      :style="{ background: swatch }"
      @click="search.updateSettings({ highlight: { color: swatch } })"
    />
    <button type="button" class="button" @click="search.resetSettings()">Reset</button>
  </div>
  <p class="announcement" aria-live="polite">{{ announcement }}</p>
</template>
