<script lang="ts">
  import { useCommand } from '@embedpdf/plugin-commands/svelte';
  import Icons from './Icons.svelte';
  import { useRegisterAnchor } from '@embedpdf/plugin-ui/svelte';

  interface Props {
    commandId: string;
    documentId: string;
    itemId?: string;
    variant?: 'icon' | 'text';
  }

  let { commandId, documentId, itemId, variant = 'text' }: Props = $props();

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

  // Tab button classes
  const className = $derived.by(() => {
    if (!command) return 'px-3 py-1.5 text-sm font-medium opacity-50 cursor-not-allowed';

    const base = 'px-3 py-1.5 text-sm font-medium rounded transition-colors';
    const state = command.current?.active
      ? 'bg-white text-gray-900 shadow-sm'
      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50';
    const disabled = command.current?.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer';

    return `${base} ${state} ${disabled}`;
  });

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
    data-tab-id={itemId}
    role="tab"
    aria-selected={command.current?.active}
    title={command.current?.label}
  >
    {#if command.current?.icon && variant === 'icon'}
      <Icons
        name={command.current.icon}
        class="h-5 w-5"
        primaryColor={cmdIconProps.primaryColor}
        secondaryColor={cmdIconProps.secondaryColor}
      />
    {:else}
      <span>{command.current?.label}</span>
    {/if}
  </button>
{/if}
