<script setup lang="ts">
import { ref } from 'vue';
import { PDFViewer, type Viewer } from '@embedpdf/viewer-vue';

import './values.css';

const forms = '/pdfs/forms.pdf';

const values = ref('{}');

// Once the form is open: show its values as they change, and fill in what the app knows.
function onReady(viewer: Viewer) {
  viewer.documents.onOpened(async () => {
    const form = viewer.get('form');
    form.onValueChanged(() => (values.value = JSON.stringify(form.exportValues())));
    await form.importValues({ name: 'Ada Lovelace', email: 'ada@example.com' });
  });
}
</script>

<template>
  <div class="app">
    <PDFViewer :src="forms" class="viewer" @ready="onReady" />
    <footer class="values">
      <span class="label">exportValues()</span>
      <code class="code">{{ values }}</code>
    </footer>
  </div>
</template>
