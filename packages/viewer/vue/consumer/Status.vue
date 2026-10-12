<script setup lang="ts">
// A component in the viewer's toolbar: where it sits, the viewer, a command and a button.
import { Button, useCommand, usePDFViewer, useToolbarItem } from '@embedpdf/viewer-vue';

const item = useToolbarItem();
const viewer = usePDFViewer();
const fitWidth = useCommand('zoom:fit-width');
</script>

<template>
  <span :class="item.orientation">{{ fitWidth.label }}</span>
  <Button command="zoom:in" />
  <button type="button" @click="viewer.get('stage').zoomOut()">Zoom out</button>
</template>
