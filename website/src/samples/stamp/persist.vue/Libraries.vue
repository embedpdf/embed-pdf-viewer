<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { saveFile } from '@embedpdf/vue/runtime';
import {
  indexedDbByteStore,
  persistStampLibraries,
  restoreStampLibraries,
  useStamp,
  useStampAssets,
  useStampLibraries,
  useStampState,
} from '@embedpdf/vue/stamp';
import type { StampLibrary } from '@embedpdf/vue/stamp';
import StampButton from './StampButton.vue';

// Where the libraries live between visits: this browser's IndexedDB.
const store = indexedDbByteStore('embedpdf-stamp-example');

const stamp = useStamp();
const libraries = useStampLibraries();
const assets = useStampAssets();
const { armedAsset } = useStampState();
const restored = ref<number | null>(null);

let stop: (() => void) | undefined;

onMounted(() => {
  // Every change is written to the store from now on.
  stop = persistStampLibraries(stamp, store);

  // On load: what the store kept. The first visit starts a library of its own.
  void restoreStampLibraries(stamp, store).then(async (ids) => {
    restored.value = ids.length;
    if (ids.length > 0) return;
    const { library } = await stamp.createLibrary('My stamps');
    await stamp.createAsset({
      libraryId: library.id,
      label: 'Checked',
      mark: { kind: 'text', text: 'Checked', fontFamily: 'times-bold-italic', color: '#1f7a3f' },
    });
  });
});
onUnmounted(() => stop?.());

async function addStamp(libraryId: string) {
  const label = `Stamp ${assets.value.length + 1}`;
  await stamp.createAsset({
    libraryId,
    label,
    mark: { kind: 'text', text: label, fontFamily: 'helvetica-bold', color: '#054fb3' },
  });
}

async function download(library: StampLibrary) {
  const bytes = await stamp.exportLibrary(library.id);
  saveFile(bytes, `${library.name}.pdf`, 'application/pdf');
}
</script>

<template>
  <div class="toolbar">
    <StampButton
      v-for="asset in assets"
      :key="asset.id"
      :asset="asset"
      :armed="armedAsset?.id === asset.id"
    />
    <span v-for="library in libraries" :key="library.id" class="group">
      <button type="button" class="button" @click="addStamp(library.id)">Add a stamp</button>
      <button
        type="button"
        class="button"
        title="The library as the PDF it is: open it in Acrobat, or import it again"
        @click="download(library)"
      >
        Download “{{ library.name }}”
      </button>
    </span>
    <span class="spacer" />
    <output class="readout">
      {{
        restored === null ? 'Restoring…' : `${restored} restored: add a stamp, then reload the page`
      }}
    </output>
  </div>
</template>
