<script lang="ts">
  import { Viewer } from '@embedpdf/svelte/runtime';

  import { contract, engine, plugins } from './setup';
</script>

<Viewer
  {engine}
  {plugins}
  identity={{ userId: 'u_381', displayName: 'Dana Smith' }}
  initialDocuments={[{ source: contract }]}
/>
