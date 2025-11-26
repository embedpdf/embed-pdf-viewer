<script lang="ts">
  import type { SelectionMenuItem, SelectionMenuPropsBase } from '@embedpdf/plugin-ui/svelte';
  import CommandButton from '../components/CommandButton.svelte';
  import ToolbarDivider from '../components/ui/ToolbarDivider.svelte';
  import Self from './SelectionMenuItemRenderer.svelte';

  interface Props {
    item: SelectionMenuItem;
    documentId: string;
    props: SelectionMenuPropsBase;
  }

  let { item, documentId, props }: Props = $props();
</script>

{#if item.type === 'command-button'}
  <CommandButton commandId={item.commandId} {documentId} variant={item.variant} />
{:else if item.type === 'divider'}
  <ToolbarDivider />
{:else if item.type === 'group'}
  <div class="flex items-center gap-{item.gap ?? 1}">
    {#each item.items as child (child.id)}
      <Self item={child} {documentId} {props} />
    {/each}
  </div>
{/if}
