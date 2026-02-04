<script lang="ts">
  import {
    type SelectionMenuItem,
    type SelectionMenuPropsBase,
    getUIItemProps,
  } from '@embedpdf/plugin-ui/svelte';
  import CommandButtonItem from './CommandButtonItem.svelte';
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
  <CommandButtonItem {item} {documentId} />
{:else if item.type === 'divider'}
  <div {...getUIItemProps(item)}>
    <ToolbarDivider />
  </div>
{:else if item.type === 'group'}
  <div {...getUIItemProps(item)} class="flex items-center gap-{item.gap ?? 1}">
    {#each item.items as child (child.id)}
      <Self item={child} {documentId} {props} />
    {/each}
  </div>
{/if}
