<script lang="ts">
  import { RenderLayer } from '@embedpdf/svelte/render';
  import { SelectionHandles, SelectionLayer, SelectionMenu } from '@embedpdf/svelte/selection';
  import { Stage } from '@embedpdf/svelte/stage';

  import CopyButton from './copy-button.svelte';
</script>

<Stage>
  {#snippet page()}
    <RenderLayer />
    <SelectionLayer />
  {/snippet}

  {#snippet overlay()}
    <SelectionMenu>
      <CopyButton />
    </SelectionMenu>
    <SelectionHandles />
  {/snippet}
</Stage>
