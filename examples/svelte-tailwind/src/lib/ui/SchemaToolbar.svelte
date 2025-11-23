<script lang="ts">
  import {
    resolveResponsiveMetadata,
    type ToolbarRendererProps,
    type ToolbarItem,
    type ResponsiveMetadata,
  } from '@embedpdf/plugin-ui/svelte';
  import { useItemRenderer } from '@embedpdf/plugin-ui/svelte';
  import { useLocale } from '@embedpdf/plugin-i18n/svelte';
  import CommandButton from '../components/CommandButton.svelte';
  import CommandTabButton from '../components/CommandTabButton.svelte';
  import { ToolbarDivider } from '../components/ui';
  import { resolveResponsiveClasses } from './responsive-utils';

  interface Props extends ToolbarRendererProps {
    className?: string;
  }

  let { schema, documentId, isOpen, className = '' }: Props = $props();

  const locale = useLocale();
  const { getCustomComponent: renderCustomComponent } = useItemRenderer();

  const responsiveMetadata = $derived(
    resolveResponsiveMetadata(schema, locale.current) as ResponsiveMetadata | null,
  );

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
    class={`flex items-center gap-2 ${placementClasses} ${slotClasses} ${className}`}
    data-toolbar-id={schema.id}
  >
    {#each schema.items as item (item.id)}
      {#if item.type === 'command-button'}
        {@const itemMetadata = responsiveMetadata?.items.get(item.id) ?? null}
        {@const responsiveClasses = resolveResponsiveClasses(itemMetadata)}
        <div class={responsiveClasses} data-item-id={item.id}>
          <CommandButton
            commandId={item.commandId}
            {documentId}
            variant={item.variant === 'tab' ? 'icon' : item.variant}
            itemId={item.id}
          />
        </div>
      {:else if item.type === 'tab-group'}
        {@const itemMetadata = responsiveMetadata?.items.get(item.id) ?? null}
        {@const responsiveClasses = resolveResponsiveClasses(itemMetadata)}
        {@const alignmentClass = getAlignmentClass(item.alignment)}
        <div
          class={`flex items-center ${alignmentClass} ${responsiveClasses}`}
          data-item-id={item.id}
          role="tablist"
        >
          <div class="flex rounded-lg bg-gray-100 p-1">
            {#each item.tabs as tab (tab.id)}
              {@const tabMetadata = responsiveMetadata?.items.get(tab.id) ?? null}
              {@const tabResponsiveClasses = resolveResponsiveClasses(tabMetadata)}
              {#if tab.commandId}
                <div class={tabResponsiveClasses} data-tab-id={tab.id}>
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
        {@const itemMetadata = responsiveMetadata?.items.get(item.id) ?? null}
        {@const responsiveClasses = resolveResponsiveClasses(itemMetadata)}
        <div class={responsiveClasses} data-item-id={item.id}>
          <ToolbarDivider />
        </div>
      {:else if item.type === 'spacer'}
        <div class={item.flex ? 'flex-1' : 'w-4'} data-item-id={item.id} aria-hidden="true" />
      {:else if item.type === 'group'}
        {@const itemMetadata = responsiveMetadata?.items.get(item.id) ?? null}
        {@const responsiveClasses = resolveResponsiveClasses(itemMetadata)}
        {@const gapClass = item.gap ? `gap-${item.gap}` : 'gap-2'}
        {@const alignmentClass = getAlignmentClass(item.alignment)}
        <div
          class={`flex items-center ${gapClass} ${alignmentClass} ${responsiveClasses}`}
          data-item-id={item.id}
        >
          {#each item.items as childItem (childItem.id)}
            {#if childItem.type === 'command-button'}
              {@const childMetadata = responsiveMetadata?.items.get(childItem.id) ?? null}
              {@const childResponsiveClasses = resolveResponsiveClasses(childMetadata)}
              <div class={childResponsiveClasses} data-item-id={childItem.id}>
                <CommandButton
                  commandId={childItem.commandId}
                  {documentId}
                  variant={childItem.variant === 'tab' ? 'icon' : childItem.variant}
                  itemId={childItem.id}
                />
              </div>
            {:else if childItem.type === 'divider'}
              {@const childMetadata = responsiveMetadata?.items.get(childItem.id) ?? null}
              {@const childResponsiveClasses = resolveResponsiveClasses(childMetadata)}
              <div class={childResponsiveClasses} data-item-id={childItem.id}>
                <ToolbarDivider />
              </div>
            {:else if childItem.type === 'custom'}
              {@const childMetadata = responsiveMetadata?.items.get(childItem.id) ?? null}
              {@const childResponsiveClasses = resolveResponsiveClasses(childMetadata)}
              {#if childItem.componentId}
                {@const Component = renderCustomComponent(childItem.componentId)}
                <div class={childResponsiveClasses} data-item-id={childItem.id}>
                  {#if Component}
                    <Component {documentId} {...childItem.props} />
                  {/if}
                </div>
              {/if}
            {/if}
          {/each}
        </div>
      {:else if item.type === 'custom'}
        {@const itemMetadata = responsiveMetadata?.items.get(item.id) ?? null}
        {@const responsiveClasses = resolveResponsiveClasses(itemMetadata)}
        {#if item.componentId}
          {@const Component = renderCustomComponent(item.componentId)}
          <div class={responsiveClasses} data-item-id={item.id}>
            {#if Component}
              <Component {documentId} {...item.props} />
            {/if}
          </div>
        {/if}
      {/if}
    {/each}
  </div>
{/if}
