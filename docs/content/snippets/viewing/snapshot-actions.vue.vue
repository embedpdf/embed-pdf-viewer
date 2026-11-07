<!-- SnapshotActions.vue: beside the pages, copy the snapshot or save it as a file -->
<script setup lang="ts">
import { copyImage, saveFile } from '@embedpdf/vue/runtime';
import { useSnapshot, type Snapshot } from '@embedpdf/vue/render';

const snapshot = useSnapshot();

async function save(shot: Snapshot) {
  saveFile(await (await shot.image).blob(), 'snapshot.png');
}
</script>

<template>
  <div v-if="snapshot" class="snapshot-actions">
    <!-- In the click itself, not after an await: the picture follows when it's there -->
    <button @click="copyImage(snapshot.image)">Copy</button>
    <button @click="save(snapshot)">Save</button>
  </div>
</template>
