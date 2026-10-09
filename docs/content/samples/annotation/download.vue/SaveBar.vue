<!-- The annotations are part of the document: the downloaded PDF has every one. -->
<script setup lang="ts">
import { saveFile, useDocument, useDocuments } from '@embedpdf/vue/runtime';
import { useInteraction, useInteractionState } from '@embedpdf/vue/interaction';

const documents = useDocuments();
const interaction = useInteraction();
const { activeToolId } = useInteractionState();
const { hasUnsavedChanges } = useDocument();

async function download() {
  saveFile(await documents.download(), 'ebook-annotated.pdf');
}
</script>

<template>
  <div class="toolbar">
    <button
      type="button"
      class="button"
      :aria-pressed="activeToolId === 'ink'"
      @click="interaction.activateTool(activeToolId === 'ink' ? 'pointer' : 'ink')"
    >
      Pen
    </button>
    <button type="button" class="button" @click="download">Download the PDF</button>
    <span class="spacer" />
    <output class="readout">{{ hasUnsavedChanges ? 'Unsaved changes' : 'All saved' }}</output>
  </div>
</template>
