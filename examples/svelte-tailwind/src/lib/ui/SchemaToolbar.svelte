<script lang="ts">
  import {
    type ToolbarRendererProps,
    type ToolbarItem,
    getUIItemProps,
  } from '@embedpdf/plugin-ui/svelte';
  import { useItemRenderer } from '@embedpdf/plugin-ui/svelte';
  import CommandButton from '../components/CommandButton.svelte';
  import CommandTabButton from '../components/CommandTabButton.svelte';
  import { ToolbarDivider } from '../components/ui';

  interface Props extends ToolbarRendererProps {
    className?: string;
  }

  let { schema, documentId, isOpen, className = '' }: Props = $props();

  const { getCustomComponent: renderCustomComponent } = useItemRenderer();

  const isSecondarySlot = $derived(schema.position.slot === 'secondary');
  const placementClasses = $derived(getPlacementClasses(schema.position.placement));
  const slotClasses = $derived(isSecondarySlot ? 'bg-[#f1f3f5]' : '');

  /**
   * Get placement classes for toolbar positioning
   */
  function getPlacementClasses(placement: 'top' | 'bottom' | 'left' | 'right'): string {
    switch (placement) {
      case 'top':
        return 'border-b border-gray-300 bg-white px-3 py-2';
      case 'bottom':
        return 'border-t border-gray-300 bg-white px-3 py-2';
      case 'left':
        return 'border-r border-gray-300 bg-white px-2 py-3 flex-col';
      case 'right':
        return 'border-l border-gray-300 bg-white px-2 py-3 flex-col';
    }
  }

  /**
   * Get alignment class for groups
   */
  function getAlignmentClass(alignment?: 'start' | 'center' | 'end'): string {
    switch (alignment) {
      case 'start':
        return 'justify-start';
      case 'center':
        return 'justify-center';
      case 'end':
        return 'justify-end';
      default:
        return 'justify-start';
    }
  }
</script>

{#if isOpen}
  <div
    {...getUIItemProps(schema, { 'data-toolbar-id': schema.id })}
    class={`flex items-center gap-2 ${placementClasses} ${slotClasses} ${className}`}
  >
    {#each schema.items as item (item.id)}
      {#if item.type === 'command-button'}
        <div {...getUIItemProps(item)}>
          <CommandButton
            commandId={item.commandId}
            {documentId}
            variant={item.variant === 'tab' ? 'icon' : item.variant}
            itemId={item.id}
          />
        </div>
      {:else if item.type === 'tab-group'}
        {@const alignmentClass = getAlignmentClass(item.alignment)}
        <div {...getUIItemProps(item)} class={`flex items-center ${alignmentClass}`} role="tablist">
          <div class="flex rounded-lg bg-gray-100 p-1">
            {#each item.tabs as tab (tab.id)}
              {#if tab.commandId}
                <div {...getUIItemProps(tab)}>
                  <CommandTabButton
                    commandId={tab.commandId}
                    {documentId}
                    itemId={tab.id}
                    variant={tab.variant === 'icon' ? 'icon' : 'text'}
                  />
                </div>
              {/if}
            {/each}
          </div>
        </div>
      {:else if item.type === 'divider'}
        <div {...getUIItemProps(item)}>
          <ToolbarDivider />
        </div>
      {:else if item.type === 'spacer'}
        <div
          {...getUIItemProps(item)}
          class={item.flex ? 'flex-1' : 'w-4'}
          aria-hidden="true"
        ></div>
      {:else if item.type === 'group'}
        {@const gapClass = item.gap ? `gap-${item.gap}` : 'gap-2'}
        {@const alignmentClass = getAlignmentClass(item.alignment)}
        <div {...getUIItemProps(item)} class={`flex items-center ${gapClass} ${alignmentClass}`}>
          {#each item.items as childItem (childItem.id)}
            {#if childItem.type === 'command-button'}
              <div {...getUIItemProps(childItem)}>
                <CommandButton
                  commandId={childItem.commandId}
                  {documentId}
                  variant={childItem.variant === 'tab' ? 'icon' : childItem.variant}
                  itemId={childItem.id}
                />
              </div>
            {:else if childItem.type === 'divider'}
              <div {...getUIItemProps(childItem)}>
                <ToolbarDivider />
              </div>
            {:else if childItem.type === 'custom'}
              {#if childItem.componentId}
                {@const Component = renderCustomComponent(childItem.componentId)}
                <div {...getUIItemProps(childItem)}>
                  {#if Component}
                    <Component {documentId} {...childItem.props} />
                  {/if}
                </div>
              {/if}
            {/if}
          {/each}
        </div>
      {:else if item.type === 'custom'}
        {#if item.componentId}
          {@const Component = renderCustomComponent(item.componentId)}
          <div {...getUIItemProps(item)}>
            {#if Component}
              <Component {documentId} {...item.props} />
            {/if}
          </div>
        {/if}
      {/if}
    {/each}
  </div>
{/if}
