<script setup lang="ts">
import { watch } from 'vue';
import { useViewManager, useViewManagerState } from '@embedpdf/vue/view-manager';
import Pane from './Pane.vue';

const views = useViewManager();
const { panes } = useViewManagerState();

// On load, both documents land in the first pane: put the second one beside it, once.
let splitOnLoad = true;
watch(
  panes,
  (current) => {
    if (splitOnLoad && current.length === 1 && current[0].documentIds.length === 2) {
      splitOnLoad = false;
      views.splitPane(current[0].documentIds[1]);
    }
  },
  { immediate: true },
);
</script>

<template>
  <div class="panes">
    <Pane v-for="pane in panes" :key="pane.id" :pane="pane" :can-remove="panes.length > 1" />
  </div>
</template>
