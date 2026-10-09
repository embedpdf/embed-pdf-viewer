<script lang="ts">
  import { onMount } from 'svelte';
  import { RenderLayer } from '@embedpdf/svelte/render';
  import { Stage } from '@embedpdf/svelte/stage';
  import { SelectionLayer } from '@embedpdf/svelte/selection';
  import { useShell } from '@embedpdf/svelte/shell';
  import ViewMenu from './ViewMenu.svelte';

  const shell = useShell();

  // The menu and its submenu are open when the document is.
  onMount(() => {
    shell.openMenu('view');
    shell.openMenu('view-tool');
  });
</script>

<ViewMenu />
<Stage class="stage">
  <RenderLayer />
  <SelectionLayer />
</Stage>
