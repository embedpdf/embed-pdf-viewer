<script setup lang="ts">
import { computed } from 'vue';
import { useAnnotation } from '@embedpdf/plugin-annotation/vue';

const { provides, state } = useAnnotation();

const activeToolId = computed(() => state.value.activeToolId);

const toggleTool = (toolId: string) => {
  const currentId = activeToolId.value;
  provides.value?.setActiveTool(currentId === toolId ? null : toolId);
};
</script>

<template>
  <div class="annotation-toolbar bg-white text-dark">
    <q-toolbar dense class="q-px-md q-gutter-sm justify-center">
      <q-btn
        flat
        round
        dense
        icon="mdi-format-text"
        :color="activeToolId === 'freeText' ? 'primary' : undefined"
        @click="toggleTool('freeText')"
      >
        <q-tooltip>Free Text</q-tooltip>
      </q-btn>
      <q-btn
        flat
        round
        dense
        icon="mdi-gesture"
        :color="activeToolId === 'ink' ? 'primary' : undefined"
        @click="toggleTool('ink')"
      >
        <q-tooltip>Ink</q-tooltip>
      </q-btn>
      <q-btn
        flat
        round
        dense
        icon="mdi-circle-outline"
        :color="activeToolId === 'circle' ? 'primary' : undefined"
        @click="toggleTool('circle')"
      >
        <q-tooltip>Circle</q-tooltip>
      </q-btn>
      <q-btn
        flat
        round
        dense
        icon="mdi-square-outline"
        :color="activeToolId === 'square' ? 'primary' : undefined"
        @click="toggleTool('square')"
      >
        <q-tooltip>Rectangle</q-tooltip>
      </q-btn>
      <q-btn
        flat
        round
        dense
        icon="mdi-arrow-top-right"
        :color="activeToolId === 'lineArrow' ? 'primary' : undefined"
        @click="toggleTool('lineArrow')"
      >
        <q-tooltip>Arrow</q-tooltip>
      </q-btn>
      <q-btn
        flat
        round
        dense
        icon="mdi-check-circle-outline"
        :color="activeToolId === 'stampApproved' ? 'primary' : undefined"
        @click="toggleTool('stampApproved')"
      >
        <q-tooltip>Approved Stamp</q-tooltip>
      </q-btn>
    </q-toolbar>
  </div>
</template>

<style scoped>
.annotation-toolbar {
  border-bottom: 1px solid #cfd4da;
}
</style>
