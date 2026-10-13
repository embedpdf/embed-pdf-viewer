<script setup lang="ts">
// The publish check's canary: each line marked "error expected" must be an error, proof that
// the published types aren't `any`.
import { PDFViewer, usePDFViewer, useToolbarItem, notAViewerExport } from '@embedpdf/viewer-vue'; // error expected

usePDFViewer().notAViewerMethod(); // error expected
const wrong: number = useToolbarItem().orientation; // error expected
void [notAViewerExport, wrong];
</script>

<template><PDFViewer :theme="42" /><!-- error expected --></template>
