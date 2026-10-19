<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { localEngine } from '@embedpdf/engine';
  import OpenError from './OpenError.svelte';
  import PasswordForm from './PasswordForm.svelte';
  import Tabs from './Tabs.svelte';

  import '../states.css';

  const engine = localEngine();
  const plugins = [stagePlugin(), renderPlugin()];

  const ebook = async (): Promise<OpenInput> => {
    const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
    return { kind: 'bytes', bytes: new Uint8Array(await response.arrayBuffer()) };
  };

  // A file that isn't a PDF, so its document can't be opened.
  const broken: OpenInput = { kind: 'bytes', bytes: new TextEncoder().encode('Not a PDF') };
</script>

<Viewer
  {engine}
  {plugins}
  initialDocuments={[
    { source: ebook, name: 'ebook.pdf' },
    { source: broken, name: 'broken.pdf', active: true },
  ]}
>
  <Tabs />
  <DocumentGate>
    {#snippet fallback()}
      <div class="panel">Opening…</div>
    {/snippet}
    {#snippet locked(document)}
      <PasswordForm {document} />
    {/snippet}
    {#snippet error(document)}
      <OpenError {document} />
    {/snippet}
    <Stage class="stage">
      <RenderLayer />
    </Stage>
  </DocumentGate>
</Viewer>
