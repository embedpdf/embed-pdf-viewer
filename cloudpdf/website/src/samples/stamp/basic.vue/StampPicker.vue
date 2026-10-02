<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useStamp, useStampAssets, useStampLibraries, useStampState } from '@embedpdf/vue/stamp';
import { loadDefaultLibrary } from '@embedpdf/default-stamps/library';
import StampButton from './StampButton.vue';

const stamp = useStamp();
const libraries = useStampLibraries();
const library = computed(() => libraries.value[0]);
const assets = useStampAssets(() => ({ libraryId: library.value?.id }));
const { armedAsset } = useStampState(); // the stamp the next click places

// On load: the standard stamps, English edition, with "Approved" armed.
onMounted(() => {
  void loadDefaultLibrary('en')
    .then((bytes) => stamp.importLibrary(bytes))
    .then(({ library: imported }) => {
      const approved = stamp
        .listAssets({ libraryId: imported.id })
        .find((asset) => asset.name === 'Approved');
      if (approved) return stamp.armAsset(approved.id);
    });
});
</script>

<template>
  <div v-if="!library" class="toolbar">
    <output class="readout">Loading the stamps…</output>
  </div>
  <div v-else class="toolbar">
    <StampButton
      v-for="asset in assets.slice(0, 6)"
      :key="asset.id"
      :asset="asset"
      :armed="armedAsset?.id === asset.id"
    />
    <span class="spacer" />
    <output class="readout">
      {{ armedAsset ? `Click a page to place “${armedAsset.label}”` : 'Pick a stamp' }}
    </output>
  </div>
</template>
