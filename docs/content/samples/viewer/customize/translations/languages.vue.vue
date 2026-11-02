<script setup lang="ts">
import { ref } from 'vue';
import { PDFViewer } from '@embedpdf/viewer-vue';

import './languages.css';

// [!doc-source welcome]
const welcome = '/pdfs/welcome.pdf';
// [!/doc-source]

// Your own words for two of the viewer's labels, in each language.
const strings = {
  en: { 'mode:annotate': 'Review', 'document:download': 'Save a copy' },
  de: { 'mode:annotate': 'Prüfen', 'document:download': 'Kopie speichern' },
  fr: { 'mode:annotate': 'Relire', 'document:download': 'Enregistrer une copie' },
  nl: { 'mode:annotate': 'Nakijken', 'document:download': 'Kopie opslaan' },
  ar: { 'mode:annotate': 'مراجعة', 'document:download': 'حفظ نسخة' },
};

const locale = ref('en');
</script>

<template>
  <div class="app">
    <header class="bar">
      <select v-model="locale" aria-label="Language">
        <option value="en">English</option>
        <option value="de">Deutsch</option>
        <option value="fr">Français</option>
        <option value="nl">Nederlands</option>
        <option value="ar">العربية</option>
      </select>
    </header>
    <PDFViewer class="viewer" :src="welcome" :strings="strings" :locale="locale" />
  </div>
</template>
