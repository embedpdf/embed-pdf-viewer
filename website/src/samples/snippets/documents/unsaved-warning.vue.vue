<script setup lang="ts">
import { watchEffect } from 'vue';
import { useDocument } from '@embedpdf/vue/runtime';

const { hasUnsavedChanges } = useDocument();

watchEffect((onCleanup) => {
  if (!hasUnsavedChanges.value) return;
  const warn = (event: BeforeUnloadEvent) => event.preventDefault();
  window.addEventListener('beforeunload', warn);
  onCleanup(() => window.removeEventListener('beforeunload', warn));
});
</script>

<template>
  <span v-if="hasUnsavedChanges">Unsaved changes</span>
</template>
