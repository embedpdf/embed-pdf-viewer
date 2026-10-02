<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRender, useRenderEvent } from '@embedpdf/vue/render';
import { useStageState } from '@embedpdf/vue/stage';

interface Entry {
  id: number;
  text: string;
}

const render = useRender();
const currentPage = useStageState((state) => state.currentPage);
const entries = ref<Entry[]>([]);
let count = 0;

useRenderEvent(
  (render) => render.onInvalidated,
  ({ pages, scope, origin }) => {
    const what = `${pages.length === 1 ? '1 page' : `${pages.length} pages`} · ${scope}`;
    const from = origin ? `an edit (${origin.kind})` : 'your code';
    entries.value = [{ id: count++, text: `${what} · from ${from}` }, ...entries.value].slice(0, 4);
  },
);

// Redraw the first page on load, so there's something in the list.
onMounted(() => render.invalidate({ pages: [0] }));

// Changes whenever this page's pixels do: key your own long-lived renders on it.
// Read as the list updates, which every redraw does.
const epoch = () => (currentPage.value ? render.getRenderEpoch(currentPage.value) : 0);

function redrawPage() {
  if (currentPage.value) render.invalidate({ pages: [currentPage.value] });
}

function redrawAnnotations() {
  if (currentPage.value) render.invalidate({ pages: [currentPage.value], scope: 'annotations' });
}
</script>

<template>
  <div class="panel">
    <div class="toolbar">
      <button type="button" class="button" :disabled="!currentPage" @click="redrawPage">
        Redraw this page
      </button>
      <button type="button" class="button" :disabled="!currentPage" @click="redrawAnnotations">
        Only its annotations
      </button>
      <output class="badge">
        render epoch <strong>{{ epoch() }}</strong>
      </output>
    </div>
    <ol class="log" aria-live="polite">
      <li v-for="entry in entries" :key="entry.id" class="entry">
        <code>onInvalidated</code> {{ entry.text }}
      </li>
    </ol>
  </div>
</template>
