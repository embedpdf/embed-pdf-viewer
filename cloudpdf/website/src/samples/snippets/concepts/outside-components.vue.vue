<script setup lang="ts">
import { Viewer, type Kernel } from '@embedpdf/vue/runtime';
import { SearchToken } from '@embedpdf/vue/search';
import { engine, plugins } from './pdf';

function onReady(viewer: Kernel) {
  const search = viewer.capability(SearchToken);
}
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" @ready="onReady" />
</template>
