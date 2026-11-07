<!-- Bookmarks the reader adds: each one goes to the place in view when it's added. -->
<script setup lang="ts">
import { computed } from 'vue';
import { useStageState } from '@embedpdf/vue/stage';
import { useOutline, useOutlineState } from '@embedpdf/vue/outline';
import type { OutlineItem } from '@embedpdf/vue/outline';

const outline = useOutline();
const { rows, current, selected, canEdit } = useOutlineState();
const { currentPageIndex } = useStageState();
const selectedNumber = computed(() => selected.value[0]?.objectNumber);

function follow(item: OutlineItem) {
  outline.select([item.ref]);
  outline.activate(item.ref);
}
</script>

<template>
  <aside class="bookmarks">
    <header class="bookmarks-header">
      <h3 class="bookmarks-title">Bookmarks</h3>
      <button
        type="button"
        class="button primary"
        :disabled="!canEdit"
        @click="outline.create({ title: `Page ${currentPageIndex + 1}` }, { select: true })"
      >
        Add
      </button>
    </header>
    <p v-if="rows.length === 0" class="empty">Scroll to a page, then add a bookmark.</p>
    <ul v-else class="list">
      <li
        v-for="{ item } in rows"
        :key="item.ref.objectNumber"
        class="row"
        :data-current="item.ref.objectNumber === current?.objectNumber || undefined"
        :data-selected="item.ref.objectNumber === selectedNumber || undefined"
      >
        <button type="button" class="row-title" @click="follow(item)">{{ item.title }}</button>
        <button
          type="button"
          class="row-delete"
          :aria-label="`Delete ${item.title}`"
          :disabled="!canEdit"
          @click="outline.delete([item.ref])"
        >
          ×
        </button>
      </li>
    </ul>
  </aside>
</template>
