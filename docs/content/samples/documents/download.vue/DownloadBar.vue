<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import { saveFile, useDocuments } from '@embedpdf/vue/runtime';
import type { PdfSaveMode } from '@embedpdf/vue/runtime';

const documents = useDocuments();
const mode = ref<PdfSaveMode>('incremental');
const sizes = ref<Record<PdfSaveMode, string> | null>(null);

const megabytes = (bytes: Uint8Array) => `${(bytes.byteLength / 1_000_000).toFixed(2)} MB`;

// How big each kind of download is: the same document, written two ways.
const cancel = new AbortController();
onBeforeUnmount(() => cancel.abort());
const { signal } = cancel;
Promise.all([
  documents.download(undefined, { signal }),
  documents.download(undefined, { mode: 'rewrite', signal }),
])
  .then(([incremental, rewrite]) => {
    sizes.value = { incremental: megabytes(incremental), rewrite: megabytes(rewrite) };
  })
  .catch(() => {}); // cancelled: the example went away

async function download() {
  saveFile(await documents.download(undefined, { mode: mode.value }), 'ebook.pdf');
}
</script>

<template>
  <div class="toolbar">
    <div class="segmented" role="group" aria-label="Kind of download">
      <button
        type="button"
        :aria-pressed="mode === 'incremental'"
        @click="mode = 'incremental'"
      >
        Incremental
      </button>
      <button type="button" :aria-pressed="mode === 'rewrite'" @click="mode = 'rewrite'">
        Rewrite
      </button>
    </div>
    <button
      type="button"
      class="download"
      :disabled="!documents.canDownload()"
      @click="download"
    >
      Download
    </button>
    <output class="sizes">
      <template v-if="sizes">
        Incremental <strong>{{ sizes.incremental }}</strong> · Rewrite
        <strong>{{ sizes.rewrite }}</strong>
      </template>
      <template v-else>Measuring…</template>
    </output>
  </div>
</template>
