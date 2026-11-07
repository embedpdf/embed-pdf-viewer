<script lang="ts">
  import { PDFViewer, type Viewer } from '@cloudpdf/viewer-svelte';

  import './values.css';

  const forms = { grant: 'shr_eBRW5E3MpolzD8G36Alp30EF' };

  let values = $state('{}');

  // Once the form is open: show its values as they change, and fill in what the app knows.
  function onready(viewer: Viewer) {
    viewer.documents.onOpened(async () => {
      const form = viewer.get('form');
      form.onValueChanged(() => (values = JSON.stringify(form.exportValues())));
      await form.importValues({ name: 'Ada Lovelace', email: 'ada@example.com' });
    });
  }
</script>

<div class="app">
  <PDFViewer src={forms} {onready} class="viewer" />
  <footer class="values">
    <span class="label">exportValues()</span>
    <code class="code">{values}</code>
  </footer>
</div>
