<script setup lang="ts">
import { PDFViewer, Region } from '@embedpdf/viewer-vue';
import AppHeader from './AppHeader.vue'; // your app
import RecentFiles from './RecentFiles.vue';
</script>

<template>
  <PDFViewer style="height: 100vh">
    <Region name="header"><AppHeader /></Region>
    <Region name="empty"><RecentFiles /></Region>
  </PDFViewer>
</template>
