<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { interactionPlugin } from '@embedpdf/svelte/interaction';
  import { actionsPlugin } from '@embedpdf/svelte/actions';
  import { FormLayer, formPlugin } from '@embedpdf/svelte/form';
  import { localEngine } from '@embedpdf/engine';
  import InvoiceBar from './InvoiceBar.svelte';

  import '../scripts.css';

  const engine = localEngine();
  // The form's scripts run with JavaScript on in the actions plugin.
  const plugins = [
    stagePlugin(),
    renderPlugin(),
    interactionPlugin(),
    formPlugin(),
    actionsPlugin({ javascript: { enabled: true } }),
  ];

  const invoice = async (): Promise<OpenInput> => {
    const response = await fetch('/pdfs/embedpdf-invoice.pdf');
    return { kind: 'bytes', id: 'invoice', bytes: new Uint8Array(await response.arrayBuffer()) };
  };
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: invoice }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <InvoiceBar />
    <Stage class="stage">
      <RenderLayer />
      <FormLayer />
    </Stage>
  </DocumentGate>
</Viewer>
