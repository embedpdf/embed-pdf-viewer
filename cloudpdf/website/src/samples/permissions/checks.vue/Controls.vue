<!-- Each control shows only when its check says yes. -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { saveFile, useDocuments, usePageList } from '@embedpdf/vue/runtime';
import { copySelection, useSelection, useSelectionState } from '@embedpdf/vue/selection';
import { useSearch } from '@embedpdf/vue/search';

const documents = useDocuments();
const search = useSearch();
const selection = useSelection();
const hasSelection = useSelectionState((state) => state.hasSelection);
const pages = usePageList();
const cover = computed(() => pages.value[0]?.ref);
const text = ref('PDF');
const copied = ref('');

// On load: a search, and some text selected, so every check has something to act on.
watch(
  text,
  (query) => {
    if (search.canSearch()) void search.search({ text: query });
  },
  { immediate: true },
);
watch(
  cover,
  (page) => {
    if (page) selection.select({ page, start: 10, count: 52 });
  },
  { immediate: true },
);

async function copy() {
  await copySelection(selection).catch(() => {}); // the browser may refuse the clipboard
  copied.value = await selection.readText();
}

async function download() {
  saveFile(await documents.download(), 'ebook.pdf');
}
</script>

<template>
  <div class="toolbar">
    <input
      v-if="search.canSearch()"
      v-model="text"
      class="field"
      type="search"
      aria-label="Search"
    />
    <button
      v-if="selection.canCopy()"
      type="button"
      class="button"
      :disabled="!hasSelection"
      @click="copy"
    >
      Copy
    </button>
    <button v-if="documents.canDownload()" type="button" class="button" @click="download">
      Download
    </button>
  </div>
  <p class="note">{{ copied ? `Copied: “${copied}”` : ' ' }}</p>
</template>
