<!-- An outline being built: add items, nest them, fold them, rename and delete them. -->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useOutline, useOutlineState } from '@embedpdf/vue/outline';
import type { OutlineItem, OutlineItemRef } from '@embedpdf/vue/outline';

const outline = useOutline();
const { items, rows, selected, canEdit } = useOutlineState();
const title = ref('Chapter');

const same = (left: OutlineItemRef | null, right: OutlineItemRef | null) =>
  left?.objectNumber === right?.objectNumber;
const item = computed(
  () => items.value.find((each) => same(each.ref, selected.value[0] ?? null)) ?? null,
);
/** The item before the picked one among its parent's children: where an indent puts it. */
const previous = computed(() => {
  const picked = item.value;
  if (!picked) return null;
  const siblings = items.value.filter((each) => same(each.parent, picked.parent));
  return siblings[siblings.indexOf(picked) - 1] ?? null;
});
const parent = computed(
  () => items.value.find((each) => same(each.ref, item.value?.parent ?? null)) ?? null,
);

// After the picked item, or at the end.
function add(inside: boolean) {
  const picked = item.value;
  void outline.create(
    inside && picked
      ? { title: title.value, parent: picked.ref }
      : {
          title: title.value,
          parent: picked?.parent ?? null,
          position: picked ? { after: picked.ref } : 'end',
        },
    { select: true },
  );
}

function indent() {
  const picked = item.value;
  const before = previous.value;
  if (!picked || !before) return;
  void outline.move([picked.ref], before.ref, 'end');
  outline.expand(before.ref);
}

function outdent() {
  const picked = item.value;
  const above = parent.value;
  if (picked && above) void outline.move([picked.ref], above.parent, { after: above.ref });
}

function pick(row: OutlineItem) {
  outline.select([row.ref]);
  title.value = row.title;
}
</script>

<template>
  <div class="editor">
    <div class="toolbar">
      <input v-model="title" class="field" aria-label="Title" />
      <button type="button" class="button" :disabled="!canEdit" @click="add(false)">Add</button>
      <button type="button" class="button" :disabled="!canEdit || !item" @click="add(true)">
        Add inside
      </button>
      <button type="button" class="button" :disabled="!canEdit || !previous" @click="indent">
        Indent
      </button>
      <button type="button" class="button" :disabled="!canEdit || !parent" @click="outdent">
        Outdent
      </button>
      <button
        type="button"
        class="button"
        :disabled="!canEdit || !item"
        @click="item && outline.update(item.ref, { title })"
      >
        Rename
      </button>
      <button
        type="button"
        class="button"
        :disabled="!canEdit || !item"
        @click="item && outline.delete([item.ref])"
      >
        Delete
      </button>
    </div>
    <p v-if="rows.length === 0" class="empty">This document has no outline yet. Add an item.</p>
    <ul v-else class="tree" role="tree">
      <li
        v-for="row in rows"
        :key="row.item.ref.objectNumber"
        class="row"
        role="treeitem"
        :aria-level="row.depth + 1"
        :aria-expanded="row.hasChildren ? row.expanded : undefined"
        :aria-selected="row.item.ref.objectNumber === item?.ref.objectNumber"
        :style="{ paddingInlineStart: `${6 + row.depth * 18}px` }"
      >
        <button
          type="button"
          class="chevron"
          :aria-label="row.expanded ? 'Collapse' : 'Expand'"
          :disabled="!row.hasChildren"
          :data-expanded="row.expanded || undefined"
          @click="outline.toggle(row.item.ref)"
        ></button>
        <button type="button" class="row-title" @click="pick(row.item)">
          {{ row.item.title }}
        </button>
      </li>
    </ul>
  </div>
</template>
