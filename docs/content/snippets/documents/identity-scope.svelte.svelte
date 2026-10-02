<script lang="ts">
  import { Viewer } from '@embedpdf/svelte/runtime';
  import { engine, plugins } from './pdf';

  const identity = { userId: 'u_381', displayName: 'Dana Smith' };
  const scope = ['doc.open', 'doc.render', 'doc.text.select', 'doc.annotate.read', 'annotations:create:self'];
</script>

<Viewer {engine} {plugins} {identity} {scope} />
