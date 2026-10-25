<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { fontsPlugin } from '@embedpdf/svelte/fonts';
  import { localEngine } from '@embedpdf/engine';
  import FontPreview from './FontPreview.svelte';

  import '../draw.css';

  const engine = localEngine();
  const plugins = [fontsPlugin()];

  const ebook = async (): Promise<OpenInput> => {
    const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
    return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
  };
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: ebook }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <FontPreview />
  </DocumentGate>
</Viewer>
