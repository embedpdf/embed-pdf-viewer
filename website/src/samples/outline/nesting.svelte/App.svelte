<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { outlinePlugin } from '@embedpdf/svelte/outline';
  import { localEngine } from '@embedpdf/engine';
  import OutlineEditor from './OutlineEditor.svelte';

  import '../nesting.css';

  const engine = localEngine();
  const plugins = [outlinePlugin()];

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
    <OutlineEditor />
  </DocumentGate>
</Viewer>
