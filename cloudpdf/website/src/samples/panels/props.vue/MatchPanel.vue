<script setup lang="ts">
import { computed } from 'vue';
import { useSearch, useSearchHits } from '@embedpdf/vue/search';
import { useShell, useSurface } from '@embedpdf/vue/shell';

// The panel shows the match its props name, and steps to the next one without reopening.
const { isOpen, props, close } = useSurface('match');
const shell = useShell();
const search = useSearch();
const hits = useSearchHits();
const index = computed(() => (typeof props.value.index === 'number' ? props.value.index : 0));
const hit = computed(() => hits.value[index.value]);

function show(next: number) {
  shell.updateSurfaceProps('match', { index: next });
  search.goToHit(hits.value[next]);
}
</script>

<template>
  <aside v-if="isOpen" class="panel" aria-label="Match">
    <header class="panel-header">
      <h3 class="panel-title">Match {{ index + 1 }} of {{ hits.length }}</h3>
      <button type="button" class="close" aria-label="Close" @click="close()">×</button>
    </header>
    <template v-if="hit">
      <p class="page">Page {{ hit.pageIndex + 1 }}</p>
      <p v-if="hit.snippet" class="snippet">
        …{{ hit.snippet.before }}<mark>{{ hit.snippet.match }}</mark>{{ hit.snippet.after }}…
      </p>
    </template>
    <p v-else class="page">Searching…</p>
    <div class="steps">
      <button type="button" class="button" :disabled="index === 0" @click="show(index - 1)">
        ← Previous
      </button>
      <button
        type="button"
        class="button"
        :disabled="index >= hits.length - 1"
        @click="show(index + 1)"
      >
        Next →
      </button>
    </div>
  </aside>
</template>
