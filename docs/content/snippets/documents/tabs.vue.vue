<script setup lang="ts">
import { useDocuments, useDocumentsState } from '@embedpdf/vue/runtime';

const documents = useDocuments();
const { documents: open, activeId } = useDocumentsState();
</script>

<template>
  <div role="tablist">
    <div v-for="document in open" :key="document.id">
      <button
        role="tab"
        :aria-selected="document.id === activeId"
        @click="documents.setActive(document.id)"
      >
        {{ document.name }}
      </button>
      <button :aria-label="`Close ${document.name}`" @click="documents.close(document.id)">×</button>
    </div>
  </div>
</template>
