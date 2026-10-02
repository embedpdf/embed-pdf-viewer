<!-- Every page as a card. Click cards to select them; the toolbar edits every selected page at once. -->
<script setup lang="ts">
import { computed, shallowRef } from 'vue';
import { usePageList } from '@embedpdf/vue/runtime';
import type { PageRef } from '@embedpdf/vue/runtime';
import { PageView } from '@embedpdf/vue/page-view';
import { RenderLayer } from '@embedpdf/vue/render';
import { usePageEdit } from '@embedpdf/vue/page-edit';

const sameRef = (left: PageRef, right: PageRef) => left.objectNumber === right.objectNumber;

const pageEdit = usePageEdit();
const pages = usePageList();
const canEdit = computed(() => pageEdit.canEdit());
// The second and third pages start selected. Refs, not indexes: they still name the
// same pages after a reorder.
const selected = shallowRef<readonly PageRef[]>(pages.value.slice(1, 3).map((page) => page.ref));
const count = computed(() => selected.value.length);

const isSelected = (page: PageRef) => selected.value.some((each) => sameRef(each, page));
function toggle(page: PageRef) {
  selected.value = isSelected(page)
    ? selected.value.filter((each) => !sameRef(each, page))
    : [...selected.value, page];
}

async function remove() {
  await pageEdit.delete(selected.value);
  selected.value = [];
}
</script>

<template>
  <div class="toolbar">
    <output class="readout">{{ count }} of {{ pages.length }} selected</output>
    <span class="spacer" />
    <button
      type="button"
      class="button"
      :disabled="!canEdit || count === 0"
      @click="pageEdit.rotateBy(selected, -90)"
    >
      ⟲ Rotate left
    </button>
    <button
      type="button"
      class="button"
      :disabled="!canEdit || count === 0"
      @click="pageEdit.rotateBy(selected, 90)"
    >
      ⟳ Rotate right
    </button>
    <button
      type="button"
      class="button"
      :disabled="!canEdit || count === 0"
      @click="pageEdit.move(selected, { index: 0 })"
    >
      Move to front
    </button>
    <!-- A document keeps at least one page. -->
    <button
      type="button"
      class="button danger"
      :disabled="!canEdit || count === 0 || count === pages.length"
      @click="remove"
    >
      Delete
    </button>
  </div>
  <ol class="pages">
    <li v-for="page in pages" :key="page.ref.objectNumber">
      <button
        type="button"
        class="card"
        :aria-pressed="isSelected(page.ref)"
        @click="toggle(page.ref)"
      >
        <PageView :page="page.ref" :width="120" class="thumbnail">
          <RenderLayer />
        </PageView>
        <span class="label">
          Page {{ page.index + 1 }}
          <span v-if="page.rotation !== 0" class="turn">· {{ page.rotation }}°</span>
        </span>
      </button>
    </li>
  </ol>
</template>
