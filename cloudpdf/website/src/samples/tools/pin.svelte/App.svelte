<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { renderPlugin } from '@embedpdf/svelte/render';
  import { stagePlugin } from '@embedpdf/svelte/stage';
  import { interactionPlugin } from '@embedpdf/svelte/interaction';
  import { cloudEngine } from '@cloudpdf/engine';
  import PinBoard from './PinBoard.svelte';

  import '../pin.css';

  const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
  const plugins = [stagePlugin(), renderPlugin(), interactionPlugin()];

  const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: ebook }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <PinBoard />
  </DocumentGate>
</Viewer>
