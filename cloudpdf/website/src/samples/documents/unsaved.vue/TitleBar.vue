<script setup lang="ts">
import { onMounted, ref, watch, watchEffect } from 'vue';
import { saveFile, useDocument, useDocuments } from '@embedpdf/vue/runtime';
import { useMetadata, useMetadataState } from '@embedpdf/vue/metadata';

const documents = useDocuments();
const metadata = useMetadata();
const title = useMetadataState((state) => state.metadata?.title ?? '');
const { hasUnsavedChanges } = useDocument();

// What the field shows: the title, until the user types.
const draft = ref(title.value);
watch(title, (value) => (draft.value = value));

// A change on load: the document gets a new title, so it has something to lose.
onMounted(() => {
  void metadata.update({ title: 'Quarterly report (draft)' });
});

// While there's something to lose, the browser asks before the page closes.
watchEffect((onCleanup) => {
  if (!hasUnsavedChanges.value) return;
  const warn = (event: BeforeUnloadEvent) => event.preventDefault();
  window.addEventListener('beforeunload', warn);
  onCleanup(() => window.removeEventListener('beforeunload', warn));
});

async function download() {
  saveFile(await documents.download(), 'report.pdf');
}
</script>

<template>
  <div class="toolbar">
    <input
      v-model="draft"
      class="field"
      aria-label="Title"
      @blur="metadata.update({ title: draft })"
    />
    <span class="badge" :data-unsaved="hasUnsavedChanges">
      {{ hasUnsavedChanges ? 'Unsaved changes' : 'Downloaded' }}
    </span>
    <button type="button" class="button" @click="download">Download</button>
  </div>
</template>
