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

  const welcome: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

  const article: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };
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
