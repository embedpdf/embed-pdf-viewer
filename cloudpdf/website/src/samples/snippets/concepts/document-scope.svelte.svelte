<script lang="ts">
  import { DocumentScope } from '@embedpdf/svelte/runtime';
  import { RenderLayer } from '@embedpdf/svelte/render';
  import { Stage } from '@embedpdf/svelte/stage';

  let { documentId }: { documentId: string } = $props();
</script>

<DocumentScope id={documentId}>
  <Stage>
    <RenderLayer />
  </Stage>
</DocumentScope>
