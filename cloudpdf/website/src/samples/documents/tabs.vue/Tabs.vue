<script setup lang="ts">
import { useDocuments, useDocumentsState } from '@embedpdf/vue/runtime';
import type { OpenSource } from '@embedpdf/vue/runtime';

defineProps<{ sketch: OpenSource }>();

const documents = useDocuments();
const { documents: open, activeId } = useDocumentsState();
</script>

<template>
  <div class="tabs" role="tablist">
    <div
      v-for="document in open"
      :key="document.id"
      class="tab"
      :data-active="document.id === activeId"
    >
      <button
        type="button"
        role="tab"
        class="name"
        :aria-selected="document.id === activeId"
        @click="documents.setActive(document.id)"
      >
        {{ document.name }}
      </button>
      <button
        type="button"
        class="close"
        :aria-label="`Close ${document.name}`"
        @click="documents.close(document.id)"
      >
        ×
      </button>
    </div>
    <button
      type="button"
      class="button"
      aria-label="Open the floor plan"
      @click="documents.open(sketch, { name: 'Floor plan' })"
    >
      +
    </button>
  </div>
</template>
