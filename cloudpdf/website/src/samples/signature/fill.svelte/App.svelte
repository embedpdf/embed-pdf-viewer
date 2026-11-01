<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { interactionPlugin } from '@embedpdf/svelte/interaction';
  import { formPlugin } from '@embedpdf/svelte/form';
  import { stampPlugin } from '@embedpdf/svelte/stamp';
  import { signaturePlugin } from '@embedpdf/svelte/signature';
  import { cloudEngine } from '@cloudpdf/engine';
import { localEngine } from '@embedpdf/engine';
  import FillBar from './FillBar.svelte';

  import '../fill.css';

  const engine = cloudEngine();
  const assetEngine = localEngine();
  // No key: a mark is only drawn in, nothing is sealed.
  const plugins = [
    stagePlugin(),
    renderPlugin(),
    interactionPlugin(),
    formPlugin(),
    stampPlugin({ assetEngine }),
    signaturePlugin(),
  ];

  const agreement: OpenInput = { kind: 'grant', grant: 'shr_G5GcxJeEBa2IiwIs0DCNruCL' };
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: agreement }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <FillBar />
    <Stage class="stage">
      <RenderLayer />
    </Stage>
  </DocumentGate>
</Viewer>
