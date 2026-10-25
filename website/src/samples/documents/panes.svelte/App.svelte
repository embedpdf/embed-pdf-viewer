<script lang="ts" module>
  import { Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { renderPlugin } from '@embedpdf/svelte/render';
  import { stagePlugin } from '@embedpdf/svelte/stage';
  import { viewManagerPlugin } from '@embedpdf/svelte/view-manager';
  import { localEngine } from '@embedpdf/engine';
  import Panes from './Panes.svelte';

  import '../panes.css';

  const engine = localEngine();
  const plugins = [stagePlugin(), renderPlugin(), viewManagerPlugin()];

  const welcome = async (): Promise<OpenInput> => {
    const response = await fetch('/pdfs/embedpdf-welcome.pdf');
    return { kind: 'bytes', bytes: new Uint8Array(await response.arrayBuffer()) };
  };
</script>

<Viewer
  {engine}
  {plugins}
  initialDocuments={[
    { source: welcome, name: 'Contract' },
    { source: welcome, name: 'Report' },
  ]}
>
  <Panes />
</Viewer>
