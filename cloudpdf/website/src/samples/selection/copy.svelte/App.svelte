<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { interactionPlugin } from '@embedpdf/svelte/interaction';
  import { SelectionClipboard, SelectionLayer, selectionPlugin } from '@embedpdf/svelte/selection';
  import { cloudEngine } from '@cloudpdf/engine';
  import CopyButton from './CopyButton.svelte';
  import SelectedText from './SelectedText.svelte';
  import SelectTitle from './SelectTitle.svelte';

  import '../copy.css';

  const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
  const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), selectionPlugin()];

  const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: ebook }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <SelectTitle />
    <SelectionClipboard />
    <CopyButton />
    <SelectedText />
    <Stage class="stage">
      <RenderLayer />
      <SelectionLayer />
    </Stage>
  </DocumentGate>
</Viewer>
