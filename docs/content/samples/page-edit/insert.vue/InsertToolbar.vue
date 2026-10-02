<!-- Inserts next to the page you're on, then goes to the first new page. -->
<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue';
import { usePageList } from '@embedpdf/vue/runtime';
import type { PageRef } from '@embedpdf/vue/runtime';
import { useStage, useStageState } from '@embedpdf/vue/stage';
import { usePageEdit } from '@embedpdf/vue/page-edit';

/** Another PDF's bytes, to insert pages from. */
const otherPdf = async () => (await fetch('https://snippet.embedpdf.com/ebook.pdf')).arrayBuffer();

const pageEdit = usePageEdit();
const stage = useStage();
const pages = usePageList();
const currentPageIndex = useStageState((state) => state.currentPageIndex);
const page = computed(() => pages.value[currentPageIndex.value]);
const added = shallowRef<readonly PageRef[]>([]);
const canEdit = computed(() => pageEdit.canEdit());

// Every insert resolves { pages }: the new pages, to go to or select.
function show(result: { pages: readonly PageRef[] }) {
  added.value = result.pages;
  stage.goToPage(result.pages[0]);
}

// A blank page after the cover, once, on load.
let inserted = false;
watch(
  () => pages.value[0],
  (cover) => {
    if (inserted || !cover) return;
    inserted = true;
    void pageEdit.insertBlank({ placement: { after: cover.ref } }).then(show);
  },
  { immediate: true },
);

const positions = computed(() =>
  added.value
    .map((each) => pages.value.findIndex((entry) => entry.ref.objectNumber === each.objectNumber) + 1)
    .filter((position) => position > 0),
);

function insertBlankAfter(after: PageRef) {
  void pageEdit.insertBlank({ placement: { after } }).then(show);
}

function duplicate(target: PageRef) {
  void pageEdit.duplicate([target]).then(show);
}

async function insertFromOtherPdf(after: PageRef) {
  show(
    await pageEdit.insertFromBytes(await otherPdf(), {
      pageIndexes: [0, 2],
      placement: { after },
    }),
  );
}
</script>

<template>
  <div v-if="page" class="toolbar">
    <button
      type="button"
      class="button"
      :disabled="!canEdit"
      @click="insertBlankAfter(page.ref)"
    >
      + Blank page after
    </button>
    <button
      type="button"
      class="button"
      :disabled="!canEdit || !pageEdit.canExtract()"
      @click="duplicate(page.ref)"
    >
      Duplicate page
    </button>
    <button
      type="button"
      class="button"
      :disabled="!canEdit"
      @click="insertFromOtherPdf(page.ref)"
    >
      + Pages 1 and 3 of another PDF
    </button>
    <span class="spacer" />
    <output class="readout">
      {{
        positions.length > 0
          ? `New: page ${positions.join(' and ')} of ${pages.length}`
          : `${pages.length} pages`
      }}
    </output>
  </div>
</template>
