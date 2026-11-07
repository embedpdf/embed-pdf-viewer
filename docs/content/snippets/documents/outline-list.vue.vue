<script setup lang="ts">
import { useOutline, useOutlineState } from '@embedpdf/vue/outline';

const outline = useOutline();
const { rows, current } = useOutlineState();
</script>

<template>
  <ul role="tree">
    <li
      v-for="{ item, depth, hasChildren, expanded } in rows"
      :key="item.ref.objectNumber"
      role="treeitem"
      :aria-level="depth + 1"
      :aria-expanded="hasChildren ? expanded : undefined"
      :aria-current="item.ref.objectNumber === current?.objectNumber ? 'location' : undefined"
      :style="{ paddingInlineStart: `${depth * 16}px` }"
    >
      <button v-if="hasChildren" @click="outline.toggle(item.ref)">
        {{ expanded ? '▾' : '▸' }}
      </button>
      <button @click="outline.activate(item.ref)">{{ item.title }}</button>
    </li>
  </ul>
</template>
