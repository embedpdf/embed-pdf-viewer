<script lang="ts">
  import { useInteractionState } from '@embedpdf/svelte/interaction';
  import { Toolbar } from '@embedpdf/svelte/toolbar';
  import { formBar, mainBar } from './bars';
  import ToolbarButton from './ToolbarButton.svelte';

  const state = useInteractionState();
  const bar = $derived(state.activeToolId === 'form-edit' ? formBar : mainBar);
</script>

<Toolbar {bar}>
  {#snippet command(cmd, variant, run)}
    <ToolbarButton command={cmd} {variant} onclick={run} />
  {/snippet}
</Toolbar>
