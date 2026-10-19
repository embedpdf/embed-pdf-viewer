<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { localEngine } from '@embedpdf/engine';
  import Toolbar from './Toolbar.svelte';

  import '../responsive.css';

  const engine = localEngine();

  // Facing pages with a roomy margin, and one rule for a narrow Stage: a thin
  // margin and one page at a time. The rule has a name, so the UI can read it too.
  const plugins = [
    stagePlugin({
      padding: 24,
      spread: 'odd',
      responsive: [
        { name: 'compact', when: { maxWidth: 600 }, settings: { padding: 4, spread: 'none' } },
      ],
    }),
    renderPlugin(),
  ];

  const ebook = async (): Promise<OpenInput> => {
    const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
    return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
  };
</script>

<script lang="ts">
  let narrow = $state(false);
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: ebook }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <Toolbar bind:narrow />
    <div class="frame" data-width={narrow ? 'narrow' : 'full'}>
      <Stage class="stage">
        <RenderLayer />
      </Stage>
    </div>
  </DocumentGate>
</Viewer>
