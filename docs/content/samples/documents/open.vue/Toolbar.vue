<script setup lang="ts">
import { useDocument, useDocuments } from '@embedpdf/vue/runtime';
import type { OpenSource } from '@embedpdf/vue/runtime';

defineProps<{ ebook: OpenSource }>();

const documents = useDocuments();
const { id, name, status, pageCount } = useDocument();

// A file the user picks opens next to the ebook, and becomes the active document.
async function openFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (file) {
    await documents.open({ kind: 'bytes', bytes: await file.arrayBuffer() }, { name: file.name });
  }
}
</script>

<template>
  <div class="toolbar">
    <span class="document">
      <template v-if="id">
        <strong>{{ name ?? 'Untitled' }}</strong>
        {{ status === 'ready' ? ` · ${pageCount} pages` : ` · ${status}` }}
      </template>
      <template v-else>No document open</template>
    </span>
    <label class="button picker">
      Open a PDF…
      <input type="file" accept="application/pdf" @change="openFile" />
    </label>
    <button v-if="id" type="button" class="button" @click="documents.close(id)">Close</button>
    <button
      v-else
      type="button"
      class="button"
      @click="documents.open(ebook, { name: 'ebook.pdf' })"
    >
      Open the ebook again
    </button>
  </div>
</template>
