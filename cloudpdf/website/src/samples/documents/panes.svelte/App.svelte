<script lang="ts" module>
  import { Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { renderPlugin } from '@embedpdf/svelte/render';
  import { stagePlugin } from '@embedpdf/svelte/stage';
  import { viewManagerPlugin } from '@embedpdf/svelte/view-manager';
  import { cloudEngine } from '@cloudpdf/engine';
  import Panes from './Panes.svelte';

  import '../panes.css';

  const engine = cloudEngine();
  const plugins = [stagePlugin(), renderPlugin(), viewManagerPlugin()];

  const welcome: OpenInput = { kind: 'grant', grant: 'shr_gvpJcG1ULUMon19C0D1wODSY' };

  const article: OpenInput = { kind: 'grant', grant: 'shr_v09cJHOmj3C8vrfUlZNTDyqX' };
</script>

<Viewer
  {engine}
  {plugins}
  initialDocuments={[
    { source: welcome, name: 'Guide' },
    { source: article, name: 'Article' },
  ]}
>
  <Panes />
</Viewer>
