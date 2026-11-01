<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { interactionPlugin } from '@embedpdf/svelte/interaction';
  import { annotationPlugin } from '@embedpdf/svelte/annotation';
  import { fontsPlugin } from '@embedpdf/svelte/fonts';
  import { localEngine } from '@embedpdf/engine';
  import Fonts from './Fonts.svelte';

  import '../list.css';

  const engine = localEngine();
  const plugins = [interactionPlugin(), annotationPlugin(), fontsPlugin()];

  // [!doc-source welcome]
  const welcome = async (): Promise<OpenInput> => {
    const response = await fetch('/pdfs/welcome.pdf');
    return { kind: 'bytes', id: 'welcome', bytes: new Uint8Array(await response.arrayBuffer()) };
  };
  // [!/doc-source]
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: welcome }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <Fonts />
  </DocumentGate>
</Viewer>
