<script setup lang="ts">
import { useDocuments } from '@embedpdf/vue/runtime';
import type { FailedDocumentInfo } from '@embedpdf/vue/runtime';

defineProps<{ document: FailedDocumentInfo }>();

const documents = useDocuments();
</script>

<template>
  <div class="panel" data-tone="error">
    <h3>Couldn’t open {{ document.name }}</h3>
    <p>{{ document.error.message }}</p>
    <div class="actions">
      <button type="button" class="button" @click="documents.retry(document.id)">Try again</button>
      <button type="button" class="button" @click="documents.close(document.id)">Close</button>
    </div>
  </div>
</template>
