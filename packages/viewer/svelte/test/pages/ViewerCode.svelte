<!-- The viewer, shown or not, with a component inside it and one outside it. -->
<script lang="ts">
  import { PDFViewer, type EmbedPdfViewerElement, type Viewer } from '@embedpdf/viewer-svelte';
  import Inside from './Inside.svelte';
  import Outside from './Outside.svelte';
  import type { ViewerCodeRecord } from './viewer-code';

  let { record }: { record: ViewerCodeRecord } = $props();

  let shown = $state(true);
  let element = $state<EmbedPdfViewerElement | null>(null);
  // The test drives the page through its record.
  $effect.pre(() => {
    record.element = () => element;
    record.show = (next) => (shown = next);
  });

  /** A plugin of the app's own, as a headless app writes one. */
  const analyticsPlugin = (config: { endpoint: string }) => ({
    id: 'acme-analytics',
    token: { name: 'analytics' },
    create: () => ({
      api: { track: (name: string) => record.tracked.push(`${config.endpoint} ${name}`) },
    }),
  });

  const plugins = {
    stage: { spread: 'odd' as const },
    analytics: analyticsPlugin({ endpoint: '/api/events' }),
  };

  function onready(viewer: Viewer) {
    const index = record.viewers.push(viewer) - 1;
    viewer.documents.onClosed(({ documentId }) =>
      record.heard.push(`${index} closed ${documentId}`),
    );
  }
</script>

<Outside {record} />
{#if shown}
  <PDFViewer
    src="/sample.pdf"
    {plugins}
    {onready}
    bind:element
    class="report-viewer"
    style="height: 100vh; display: block"
  >
    <Inside {record} />
  </PDFViewer>
{/if}
