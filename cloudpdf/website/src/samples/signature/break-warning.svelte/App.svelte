<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { interactionPlugin } from '@embedpdf/svelte/interaction';
  import { AnnotationLayer, annotationPlugin } from '@embedpdf/svelte/annotation';
  import { formPlugin } from '@embedpdf/svelte/form';
  import { signaturePlugin } from '@embedpdf/svelte/signature';
  import { cloudEngine } from '@cloudpdf/engine';
  import WarningBar from './WarningBar.svelte';

  import '../break-warning.css';

  const engine = cloudEngine();

  // The certificate EmbedPDF signed the agreement with, published next to it. Trusting it is what
  // makes the signature read 'valid'; your app trusts its own certificates the same way.
  const embedpdfCertificate = async () => {
    const response = await fetch('/pdfs/embedpdf-agreement.cer');
    return new Uint8Array(await response.arrayBuffer());
  };

  const plugins = [
    stagePlugin(),
    renderPlugin(),
    interactionPlugin(),
    annotationPlugin(),
    formPlugin(),
    signaturePlugin({ trust: { anchors: async () => [await embedpdfCertificate()] } }),
  ];

  const agreement: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: agreement }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <WarningBar />
    <Stage class="stage">
      <RenderLayer />
      <AnnotationLayer />
    </Stage>
  </DocumentGate>
</Viewer>
