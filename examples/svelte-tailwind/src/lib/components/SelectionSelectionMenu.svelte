<script lang="ts">
  import { useSelectionCapability } from '@embedpdf/plugin-selection/svelte';
  import type { SelectionSelectionMenuProps } from '@embedpdf/plugin-selection/svelte';
  import Icons from './Icons.svelte';

  interface Props extends SelectionSelectionMenuProps {
    documentId: string;
  }

  let { rect, menuWrapperProps, placement, documentId }: Props = $props();

  const selectionCapability = useSelectionCapability();
  let copied = $state(false);
  let spanElement = $state<HTMLSpanElement | null>(null);

  // Reset copied state when placement changes
  $effect(() => {
    if (placement) {
      copied = false;
    }
  });

  // Register the ref callback
  $effect(() => {
    if (menuWrapperProps.ref && spanElement) {
      menuWrapperProps.ref(spanElement);
    }
  });

  function handleCopy() {
    if (!selectionCapability.provides) return;

    const scope = selectionCapability.provides.forDocument(documentId);
    if (!scope) return;

    // Copy to clipboard
    scope.copyToClipboard();

    // Clear selection
    scope.clear();

    // Show feedback
    copied = true;
    setTimeout(() => {
      copied = false;
    }, 1500);
  }

  // Calculate position based on suggestTop
  const menuStyle = $derived(
    placement.suggestTop
      ? `position: absolute; pointer-events: auto; cursor: default; top: -40px; left: 50%; transform: translateX(-50%);`
      : `position: absolute; pointer-events: auto; cursor: default; top: ${rect.size.height + 8}px; left: 50%; transform: translateX(-50%);`,
  );
</script>

<span bind:this={spanElement} style={menuWrapperProps.style}>
  <div class="rounded-lg border border-gray-200 bg-white shadow-lg" style={menuStyle}>
    <div class="flex items-center gap-1 px-2 py-1">
      <button
        onclick={handleCopy}
        class="flex items-center gap-1.5 rounded px-2 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-100"
        aria-label="Copy selected text"
        title="Copy"
      >
        {#if copied}
          <Icons name="check" class="h-4 w-4" style="color: rgb(22 163 74);" />
          <span class="text-green-600">Copied!</span>
        {:else}
          <Icons name="squares" class="h-4 w-4" />
          <span>Copy</span>
        {/if}
      </button>
    </div>
  </div>
</span>
