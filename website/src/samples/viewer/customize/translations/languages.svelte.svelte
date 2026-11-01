<script lang="ts">
  import { PDFViewer } from '@embedpdf/viewer-svelte';

  import './languages.css';

  const welcome = '/pdfs/welcome.pdf';

  // Your own words for two of the viewer's labels, in each language.
  const strings = {
    en: { 'mode:annotate': 'Review', 'document:download': 'Save a copy' },
    de: { 'mode:annotate': 'Prüfen', 'document:download': 'Kopie speichern' },
    fr: { 'mode:annotate': 'Relire', 'document:download': 'Enregistrer une copie' },
    nl: { 'mode:annotate': 'Nakijken', 'document:download': 'Kopie opslaan' },
    ar: { 'mode:annotate': 'مراجعة', 'document:download': 'حفظ نسخة' },
  };

  let locale = $state('en');
</script>

<div class="app">
  <header class="bar">
    <select bind:value={locale} aria-label="Language">
      <option value="en">English</option>
      <option value="de">Deutsch</option>
      <option value="fr">Français</option>
      <option value="nl">Nederlands</option>
      <option value="ar">العربية</option>
    </select>
  </header>
  <PDFViewer class="viewer" src={welcome} {strings} {locale} />
</div>
