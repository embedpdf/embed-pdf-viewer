<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { localEngine } from '@embedpdf/engine';
  import Thumbnails from './Thumbnails.svelte';
  import { ThumbsToken } from './thumbs-token';

  import '../thumbnail-strip.css';

  const engine = localEngine();

  const plugins = [
    stagePlugin(), // the main view
    stagePlugin({
      id: 'stage-thumbs',
      token: ThumbsToken,
      interaction: false, // a drag doesn't select text or draw
      zoomGestures: false, // a pinch doesn't resize the thumbnails
      zoom: { pageWidth: 96 },
      gap: { px: 12 },
      padding: 10,
      pageFrame: { bottom: 20 }, // room for the page number
      // A wide, short strip (on a phone) lines the thumbnails up in a row.
      responsive: [{ when: { orientation: 'landscape' }, settings: { layout: 'horizontal' } }],
    }),
    renderPlugin(),
  ];

  // [!doc-source ebook]
  const ebook = async (): Promise<OpenInput> => {
    const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
    return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
  };
  // [!/doc-source]
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: ebook }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <div class="reader">
      <Thumbnails />
      <Stage class="stage">
        <RenderLayer />
      </Stage>
    </div>
  </DocumentGate>
</Viewer>
