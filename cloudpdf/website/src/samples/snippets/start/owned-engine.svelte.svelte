<script lang="ts">
  import { Viewer } from '@embedpdf/svelte/runtime';
  import { cloudEngine } from '@cloudpdf/engine';
  import { plugins } from './pdf';
</script>

<Viewer engine={() => cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' })} {plugins} />
