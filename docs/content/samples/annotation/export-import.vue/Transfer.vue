<!-- The bundle as one JSON text: what you'd store in your own database. -->
<script setup lang="ts">
import { ref, watch } from 'vue';
import {
  AnnotationTransfer,
  useAnnotation,
  useAnnotationList,
  useAnnotationState,
} from '@embedpdf/vue/annotation';

const annotation = useAnnotation();
const ready = useAnnotationState((state) => state.status === 'ready');
const annotations = useAnnotationList();
const text = ref('');
const status = ref('');

async function exportAll() {
  const bundle = await annotation.export(); // everything
  text.value = AnnotationTransfer.stringify(bundle);
  status.value = `Exported ${bundle.items.length}`;
}

async function deleteAll() {
  await Promise.all(annotation.list().map((each) => annotation.delete(each.ref)));
  status.value = 'Deleted them all';
}

async function importText() {
  try {
    const { annotations: imported, dropped } = await annotation.import(
      await AnnotationTransfer.parse(text.value),
    );
    status.value = `Imported ${imported.length}, left out ${dropped.length}`;
  } catch (error) {
    status.value = error instanceof Error ? error.message : String(error);
  }
}

// On load: everything in the document, exported at once.
let started = false;
watch(
  ready,
  (isReady) => {
    if (!isReady || started) return;
    started = true;
    void exportAll();
  },
  { immediate: true },
);
</script>

<template>
  <div class="panel transfer">
    <div class="toolbar">
      <button type="button" class="button" @click="exportAll">Export</button>
      <button type="button" class="button" :disabled="annotations.length === 0" @click="deleteAll">
        Delete all
      </button>
      <button type="button" class="button" :disabled="text === ''" @click="importText">
        Import
      </button>
    </div>
    <output class="readout">{{ status }}</output>
    <textarea
      v-model="text"
      class="bundle"
      aria-label="The exported bundle"
      spellcheck="false"
    ></textarea>
  </div>
</template>
