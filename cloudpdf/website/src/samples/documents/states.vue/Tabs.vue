<script setup lang="ts">
import { useDocuments, useDocumentsState } from '@embedpdf/vue/runtime';

const documents = useDocuments();
const { documents: open, activeId } = useDocumentsState();
</script>

<template>
  <div class="tabs" role="tablist">
    <button
      v-for="document in open"
      :key="document.id"
      type="button"
      role="tab"
      class="tab"
      :aria-selected="document.id === activeId"
      @click="documents.setActive(document.id)"
    >
      <span class="status" :data-status="document.status" />
      {{ document.name }}
    </button>
  </div>
</template>
