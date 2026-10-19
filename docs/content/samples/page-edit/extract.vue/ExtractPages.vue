<!-- Tick pages, then download them as a PDF of their own. This document doesn't change. -->
<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue';
import { saveFile, usePageList } from '@embedpdf/vue/runtime';
import type { PageRef } from '@embedpdf/vue/runtime';
import { PageView } from '@embedpdf/vue/page-view';
import { RenderLayer } from '@embedpdf/vue/render';
import { usePageEdit } from '@embedpdf/vue/page-edit';

const pageEdit = usePageEdit();
const pages = usePageList();
// The middle two pages start ticked.
const ticked = shallowRef<readonly PageRef[]>(pages.value.slice(1, 3).map((page) => page.ref));
const saved = ref<string | null>(null);

const isTicked = (page: PageRef) => ticked.value.some((each) => each.objectNumber === page.objectNumber);
function toggle(page: PageRef) {
  ticked.value = isTicked(page)
    ? ticked.value.filter((each) => each.objectNumber !== page.objectNumber)
    : [...ticked.value, page];
}

// In document order, whatever order they were ticked in.
const chosen = computed(() =>
  pages.value.filter((page) => isTicked(page.ref)).map((page) => page.ref),
);

async function download() {
  const bytes = await pageEdit.extract(chosen.value);
  saveFile(bytes, 'pages.pdf');
  saved.value = `pages.pdf · ${chosen.value.length} pages · ${Math.round(bytes.byteLength / 1024)} KB`;
}
</script>

<template>
  <div class="toolbar">
    <button
      type="button"
      class="button primary"
      :disabled="chosen.length === 0 || !pageEdit.canExtract()"
      @click="download"
    >
      Download {{ chosen.length === 1 ? '1 page' : `${chosen.length} pages` }} as a PDF
    </button>
    <output class="readout">{{ saved }}</output>
  </div>
  <ol class="grid">
    <li v-for="page in pages" :key="page.ref.objectNumber">
      <label class="card" :data-ticked="isTicked(page.ref)">
        <PageView :page="page.ref" :width="110" class="thumbnail">
          <RenderLayer />
        </PageView>
        <span class="label">
          <input type="checkbox" :checked="isTicked(page.ref)" @change="toggle(page.ref)" />
          Page {{ page.index + 1 }}
        </span>
      </label>
    </li>
  </ol>
</template>
