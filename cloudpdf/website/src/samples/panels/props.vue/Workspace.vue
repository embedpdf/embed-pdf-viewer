<script setup lang="ts">
import { onMounted } from 'vue';
import { Stage } from '@embedpdf/vue/stage';
import { RenderLayer } from '@embedpdf/vue/render';
import { SearchLayer, useSearch, useSearchHits } from '@embedpdf/vue/search';
import type { SearchHit } from '@embedpdf/vue/search';
import { useShell } from '@embedpdf/vue/shell';
import MatchPanel from './MatchPanel.vue';

const shell = useShell();
const search = useSearch();
const hits = useSearchHits();

// Every "PDF" on the pages, and the first one open in the panel.
onMounted(() => {
  void search.search({ text: 'PDF' });
  shell.open('match', { exclusive: 'right', props: { index: 0 } });
});

// A click on a match opens it in the panel.
function openMatch(hit: SearchHit) {
  shell.open('match', { exclusive: 'right', props: { index: hits.value.indexOf(hit) } });
}
</script>

<template>
  <div class="workspace">
    <Stage class="stage">
      <template #page>
        <RenderLayer />
        <SearchLayer @hit-click="openMatch" />
      </template>
    </Stage>
    <MatchPanel />
  </div>
</template>
