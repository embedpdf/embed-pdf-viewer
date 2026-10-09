<script lang="ts" module>
  import { Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { renderPlugin } from '@embedpdf/svelte/render';
  import { stagePlugin } from '@embedpdf/svelte/stage';
  import { localEngine } from '@embedpdf/engine';
  import SideBySide from './SideBySide.svelte';

  import '../scope.css';

  const engine = localEngine();
  const plugins = [stagePlugin(), renderPlugin()];

  // [!doc-source ebook]
  const ebook = async (): Promise<OpenInput> => {
    const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
    return { kind: 'bytes', bytes: new Uint8Array(await response.arrayBuffer()) };
  };
  // [!/doc-source]
</script>

<Viewer
  {engine}
  {plugins}
  initialDocuments={[
    { source: ebook, name: 'Original' },
    { source: ebook, name: 'Revised' },
  ]}
>
  <SideBySide />
</Viewer>
