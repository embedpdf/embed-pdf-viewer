<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { Stage } from '@embedpdf/vue/stage';
import { RenderLayer } from '@embedpdf/vue/render';
import { SearchLayer } from '@embedpdf/vue/search';
import { useShell } from '@embedpdf/vue/shell';
import NotesPanel from './NotesPanel.vue';
import PanelButton from './PanelButton.vue';
import SearchPanel from './SearchPanel.vue';

const shell = useShell();
// Your app's own data: it stays when the panel closes.
const notes = ref('');

// The search panel is open when the document is.
onMounted(() => shell.open('search', { exclusive: 'right' }));
</script>

<template>
  <div class="toolbar">
    <PanelButton id="search" label="Search" />
    <PanelButton id="notes" label="Notes" />
  </div>
  <div class="workspace">
    <Stage class="stage">
      <template #page>
        <RenderLayer />
        <SearchLayer />
      </template>
    </Stage>
    <SearchPanel />
    <NotesPanel v-model="notes" />
  </div>
</template>
