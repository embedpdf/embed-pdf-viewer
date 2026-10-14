<script setup lang="ts">
import { PDFViewer, ToolbarItem, type Layout } from '@embedpdf/viewer-vue';
import { useVersions } from './versions'; // your app

const { versions, current, currentUrl, select } = useVersions();

const layout = (layout: Layout) =>
  layout.add({ custom: 'versions', command: 'acme:versions' }, { to: 'main', section: 'start' });
</script>

<template>
  <PDFViewer :src="currentUrl" :layout="layout" style="height: 100vh">
    <ToolbarItem id="versions">
      <select class="versions" :value="current" @change="select(($event.target as HTMLSelectElement).value)">
        <option v-for="version in versions" :key="version.id" :value="version.id">
          {{ version.label }}
        </option>
      </select>
    </ToolbarItem>
  </PDFViewer>
</template>
