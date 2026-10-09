<script lang="ts" module>
  import { Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { renderPlugin } from '@embedpdf/svelte/render';
  import { stagePlugin } from '@embedpdf/svelte/stage';
  import { cloudEngine } from '@cloudpdf/engine';
  import SideBySide from './SideBySide.svelte';

  import '../scope.css';

  const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
  const plugins = [stagePlugin(), renderPlugin()];

  const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };
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
