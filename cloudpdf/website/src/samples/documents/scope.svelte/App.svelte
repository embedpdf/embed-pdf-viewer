<script lang="ts" module>
  import { Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { renderPlugin } from '@embedpdf/svelte/render';
  import { stagePlugin } from '@embedpdf/svelte/stage';
  import { cloudEngine } from '@cloudpdf/engine';
  import SideBySide from './SideBySide.svelte';

  import '../scope.css';

  const engine = cloudEngine();
  const plugins = [stagePlugin(), renderPlugin()];

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
  <SideBySide />
</Viewer>
