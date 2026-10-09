<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useStamp, useStampAssets, useStampLibraries, useStampState } from '@embedpdf/vue/stamp';
import { LOCALES, loadDefaultLibrary } from '@embedpdf/default-stamps/library';
import StampButton from './StampButton.vue';

const stamp = useStamp();
const libraries = useStampLibraries();
const library = computed(() => libraries.value[0]);
const assets = useStampAssets(() => ({ libraryId: library.value?.id }));
const { armedAsset } = useStampState();
const locale = ref('nl');

// The library of the chosen language replaces the one before: the same
// identifiers, translated labels. Dutch on load.
watch(
  locale,
  (code, _previous, onCleanup) => {
    let current = true;
    onCleanup(() => {
      current = false;
    });
    void loadDefaultLibrary(code).then(async (bytes) => {
      if (!current) return;
      for (const old of stamp.listLibraries()) await stamp.deleteLibrary(old.id);
      if (current) await stamp.importLibrary(bytes);
    });
  },
  { immediate: true },
);
</script>

<template>
  <div class="toolbar">
    <select v-model="locale" class="field" aria-label="Language">
      <option v-for="code in LOCALES" :key="code" :value="code">{{ code }}</option>
    </select>
    <StampButton
      v-for="asset in assets.slice(0, 4)"
      :key="asset.id"
      :asset="asset"
      :armed="armedAsset?.id === asset.id"
    />
    <span class="spacer" />
    <output class="readout">{{ library?.name ?? 'Loading…' }}</output>
  </div>
</template>
