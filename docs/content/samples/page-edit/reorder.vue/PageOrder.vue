<!-- Pick a page, then move it. Each button uses another placement. -->
<script setup lang="ts">
import { computed, shallowRef } from 'vue';
import { usePageList } from '@embedpdf/vue/runtime';
import type { PageRef } from '@embedpdf/vue/runtime';
import { PageView } from '@embedpdf/vue/page-view';
import { RenderLayer } from '@embedpdf/vue/render';
import { usePageEdit } from '@embedpdf/vue/page-edit';

const pageEdit = usePageEdit();
const pages = usePageList();
const canEdit = computed(() => pageEdit.canEdit());
// The last page starts selected. Its ref names it wherever it moves.
const selected = shallowRef<PageRef | null>(pages.value[pages.value.length - 1]?.ref ?? null);

const page = computed(() =>
  pages.value.find((each) => each.ref.objectNumber === selected.value?.objectNumber),
);
const before = computed(() => page.value && pages.value[page.value.index - 1]);
const after = computed(() => page.value && pages.value[page.value.index + 1]);

function toFront() {
  if (page.value) void pageEdit.reorder([page.value.ref], 'start');
}
function earlier() {
  if (page.value && before.value)
    void pageEdit.reorder([page.value.ref], { before: before.value.ref });
}
function later() {
  if (page.value && after.value)
    void pageEdit.reorder([page.value.ref], { after: after.value.ref });
}
function toBack() {
  if (page.value) void pageEdit.reorder([page.value.ref], 'end');
}
</script>

<template>
  <div class="toolbar">
    <output class="readout">{{ page ? `Page ${page.index + 1} selected` : 'Pick a page' }}</output>
    <span class="spacer" />
    <button type="button" class="button" :disabled="!canEdit || !before" @click="toFront">
      ⇤ To the front
    </button>
    <button type="button" class="button" :disabled="!canEdit || !before" @click="earlier">
      ← Earlier
    </button>
    <button type="button" class="button" :disabled="!canEdit || !after" @click="later">
      Later →
    </button>
    <button type="button" class="button" :disabled="!canEdit || !after" @click="toBack">
      To the back ⇥
    </button>
  </div>
  <ol class="strip">
    <li v-for="each in pages" :key="each.ref.objectNumber">
      <button
        type="button"
        class="card"
        :aria-pressed="each.ref.objectNumber === selected?.objectNumber"
        @click="selected = each.ref"
      >
        <PageView :page="each.ref" :width="110" class="thumbnail">
          <RenderLayer />
        </PageView>
        <span class="label">{{ each.index + 1 }}</span>
      </button>
    </li>
  </ol>
</template>
