<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { renderPlugin } from '@embedpdf/svelte/render';
  import { stagePlugin } from '@embedpdf/svelte/stage';
  import { localEngine } from '@embedpdf/engine';
  import { OverviewToken } from './overview-token';
  import Views from './Views.svelte';

  import '../two-views.css';

  const engine = localEngine();

  const plugins = [
    stagePlugin(), // the main view
    stagePlugin({
      id: 'stage-overview',
      token: OverviewToken,
      layout: 'grid',
      columns: 'auto',
      zoom: { pageWidth: 72 },
      gap: { px: 10 },
      padding: 10,
      interaction: false, // a drag only scrolls it
      // A wide, short box (a phone) lines the pages up in one row.
      responsive: [{ when: { orientation: 'landscape' }, settings: { layout: 'horizontal' } }],
    }),
    renderPlugin(),
  ];

  const welcome = async (): Promise<OpenInput> => {
    const response = await fetch('/pdfs/embedpdf-welcome.pdf');
    return { kind: 'bytes', id: 'welcome', bytes: new Uint8Array(await response.arrayBuffer()) };
  };
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: welcome }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <Views />
  </DocumentGate>
</Viewer>
