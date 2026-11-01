<script setup lang="ts">
import { ref } from 'vue';
import { PDFViewer, type ViewerConfig } from '@embedpdf/viewer-vue';
import './approve.css';

// [!doc-source welcome]
const welcome = '/pdfs/welcome.pdf';
// [!/doc-source]

const status = ref('Waiting for approval');

const config: ViewerConfig = {
  commands: [
    {
      id: 'acme:approve',
      label: 'Approve',
      icon: 'check',
      shortcut: 'Mod+Enter',
      run: () => {
        status.value = `Approved at ${new Date().toLocaleTimeString()}`;
      },
    },
  ],
  layout: (layout) => layout.add('acme:approve', { to: 'main', section: 'end' }),
};
</script>

<template>
  <div class="app" style="height: 100%">
    <p class="status">
      Status: <strong>{{ status }}</strong>
    </p>
    <PDFViewer :src="welcome" v-bind="config" class="viewer" />
  </div>
</template>
