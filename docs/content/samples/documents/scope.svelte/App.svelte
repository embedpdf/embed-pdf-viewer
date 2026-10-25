<script lang="ts" module>
  import { Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { renderPlugin } from '@embedpdf/svelte/render';
  import { stagePlugin } from '@embedpdf/svelte/stage';
  import { localEngine } from '@embedpdf/engine';
  import SideBySide from './SideBySide.svelte';

  import '../scope.css';

  const engine = localEngine();
  const plugins = [stagePlugin(), renderPlugin()];

  // [!doc-source welcome]
  const welcome = async (): Promise<OpenInput> => {
    const response = await fetch('/pdfs/embedpdf-welcome.pdf');
    return { kind: 'bytes', bytes: new Uint8Array(await response.arrayBuffer()) };
  };
  // [!/doc-source]

  // [!doc-source article]
  const article = async (): Promise<OpenInput> => {
    const response = await fetch('/pdfs/embedpdf-article.pdf');
    return { kind: 'bytes', bytes: new Uint8Array(await response.arrayBuffer()) };
  };
  // [!/doc-source]
</script>

<Viewer
  {engine}
  {plugins}
  initialDocuments={[
    { source: welcome, name: 'Guide' },
    { source: article, name: 'Article' },
  ]}
>
  <SideBySide />
</Viewer>
