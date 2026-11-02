<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { fontsPlugin } from '@embedpdf/svelte/fonts';
  import { localEngine } from '@embedpdf/engine';
  import FontPreview from './FontPreview.svelte';

  import '../draw.css';

  const engine = localEngine();
  const plugins = [fontsPlugin()];

  const welcome = async (): Promise<OpenInput> => {
    const response = await fetch('/pdfs/welcome.pdf');
    return { kind: 'bytes', id: 'welcome', bytes: new Uint8Array(await response.arrayBuffer()) };
  };
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: welcome }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <FontPreview />
  </DocumentGate>
</Viewer>
