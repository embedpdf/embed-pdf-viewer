<script lang="ts">
  import { PDFViewer, type Viewer } from '@embedpdf/viewer-svelte';

  import './on-ready.css';

  const article = '/pdfs/article.pdf';

  let viewer = $state.raw<Viewer | null>(null);
  let page = $state<number | null>(null);

  function onready(ready: Viewer) {
    viewer = ready;
    // The pages are the document's: follow the current one once it has opened.
    ready.documents.onOpened(() => {
      const stage = ready.get('stage');
      page = stage.getCurrentPageIndex() + 1;
      ready.watch(
        () => stage.getCurrentPageIndex(),
        (index) => (page = index + 1),
      );
    });
  }
</script>

<div class="app">
  <header class="bar">
    <span class="page">{page ? `Page ${page}` : 'Opening…'}</span>
    <button
      type="button"
      class="button"
      disabled={!viewer}
      onclick={() => viewer?.commands.execute('document:print')}
    >
      Print
    </button>
  </header>
  <PDFViewer src={article} {onready} class="viewer" />
</div>
