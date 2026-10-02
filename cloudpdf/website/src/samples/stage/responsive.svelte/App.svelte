<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { cloudEngine } from '@cloudpdf/engine';
  import Toolbar from './Toolbar.svelte';

  import '../responsive.css';

  const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });

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

  const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };
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
