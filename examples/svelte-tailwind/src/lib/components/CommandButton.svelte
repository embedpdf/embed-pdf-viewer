<script lang="ts">
  import { useCommand } from '@embedpdf/plugin-commands/svelte';
  import Icons from './Icons.svelte';
  import { useRegisterAnchor } from '@embedpdf/plugin-ui/svelte';

  interface Props {
    commandId: string;
    documentId: string;
    variant?: 'icon' | 'text' | 'icon-text';
    itemId?: string;
  }

  let { commandId, documentId, variant = 'icon', itemId }: Props = $props();

  const command = useCommand(
    () => commandId,
    () => documentId,
  );

  // Register this button with the anchor registry if itemId is provided
  // This allows menus to anchor to it when opened via UI state changes
  const finalItemId = itemId || commandId;
  const registerAnchor = useRegisterAnchor(
    () => documentId,
    () => finalItemId,
  );

  function handleClick() {
    if (command && !command.current?.disabled) {
      command.current?.execute();
    }
  }

  const baseClasses = $derived.by(() => {
    switch (variant) {
      case 'text':
        return 'px-3 py-1.5 text-sm font-medium';
      case 'icon-text':
        return 'flex items-center gap-2 px-3 py-1.5 text-sm font-medium';
      default:
        return 'p-2';
    }
  });

  const stateClasses = $derived.by(() => {
    const cmd = command?.current;
    if (!cmd || cmd.disabled) return 'opacity-50 cursor-not-allowed';
    if (cmd.active)
      return 'bg-blue-100 text-blue-600 hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-300';
    return 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800';
  });

  const className = $derived(
    `inline-flex items-center justify-center rounded transition-colors ${baseClasses} ${stateClasses}`,
  );

  // Safely access icon props
  const cmdIconProps = $derived(command?.current?.iconProps || {});
</script>

{#if command?.current?.visible}
  <button
    use:registerAnchor
    type="button"
    class={className}
    onclick={handleClick}
    disabled={command.current?.disabled}
    data-item-id={itemId}
    title={command.current?.label}
  >
    {#if command.current?.icon && (variant === 'icon' || variant === 'icon-text')}
      <!-- 
         The 'name' prop triggers the registry lookup.
         The ...spread passes the styles down to the SVG. 
      -->
      <Icons
        name={command.current.icon}
        class="h-5 w-5"
        primaryColor={cmdIconProps.primaryColor}
        secondaryColor={cmdIconProps.secondaryColor}
      />
    {/if}
    {#if variant === 'text' || variant === 'icon-text'}
      <span>{command.current?.label}</span>
    {/if}
  </button>
{/if}
