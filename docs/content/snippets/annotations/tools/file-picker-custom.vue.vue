<script setup lang="ts">
import { useFilePickerProvider } from '@embedpdf/vue/annotation';

import { openStampLibrary } from './stamp-library';

useFilePickerProvider(async ({ toolId, page, point }) => {
  if (toolId === 'stamp') return { data: await openStampLibrary() };
  return null;
});
</script>

<template>
  <div role="toolbar"><!-- your tools --></div>
</template>
