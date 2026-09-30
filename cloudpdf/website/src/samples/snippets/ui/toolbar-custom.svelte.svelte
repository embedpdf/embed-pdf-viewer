<script lang="ts">
  import { Toolbar, custom, group } from '@embedpdf/svelte/toolbar';
  import ToolbarButton from './ToolbarButton.svelte';
  import PageNumberInput from './PageNumberInput.svelte';

  const bar = {
    id: 'main',
    sections: {
      center: [group('page', [custom('page-number', 'page:go-to', { variants: ['full', 'compact'] })])],
    },
  };
</script>

<Toolbar {bar}>
  {#snippet command(cmd, variant, run)}
    <ToolbarButton command={cmd} {variant} onclick={run} />
  {/snippet}
  {#snippet custom(name, variant)}
    {#if name === 'page-number'}
      <PageNumberInput compact={variant === 'compact'} />
    {/if}
  {/snippet}
</Toolbar>
