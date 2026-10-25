<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { outlinePlugin } from '@embedpdf/svelte/outline';
  import { localEngine } from '@embedpdf/engine';
  import OutlineEditor from './OutlineEditor.svelte';

  import '../nesting.css';

  const engine = localEngine();
  const plugins = [outlinePlugin()];

  // [!doc-source welcome]
  const welcome = async (): Promise<OpenInput> => {
    const response = await fetch('/pdfs/embedpdf-welcome.pdf');
    return { kind: 'bytes', id: 'welcome', bytes: new Uint8Array(await response.arrayBuffer()) };
  };
  // [!/doc-source]
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: welcome }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <OutlineEditor />
  </DocumentGate>
</Viewer>
