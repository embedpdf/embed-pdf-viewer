<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { interactionPlugin } from '@embedpdf/svelte/interaction';
  import { AnnotationLayer, annotationPlugin } from '@embedpdf/svelte/annotation';
  import { FormLayer, formPlugin } from '@embedpdf/svelte/form';
  import { stampPlugin } from '@embedpdf/svelte/stamp';
  import { createTestSigner, signaturePlugin } from '@embedpdf/svelte/signature';
  import { cloudEngine } from '@cloudpdf/engine';
import { localEngine } from '@embedpdf/engine';
  import ArmBar from './ArmBar.svelte';

  import '../click-to-sign.css';

  const engine = cloudEngine();
  const assetEngine = localEngine();
  const signer = createTestSigner({ commonName: 'Ada Lovelace' });
  const plugins = [
    stagePlugin(),
    renderPlugin(),
    interactionPlugin(),
    annotationPlugin(),
    formPlugin(),
    stampPlugin({ assetEngine }),
    signaturePlugin({ key: () => signer }),
  ];

  const agreement: OpenInput = { kind: 'grant', grant: 'shr_G5GcxJeEBa2IiwIs0DCNruCL' };
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: agreement }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <ArmBar />
    <Stage class="stage">
      <RenderLayer />
      <AnnotationLayer />
      <FormLayer />
    </Stage>
  </DocumentGate>
</Viewer>
