<script lang="ts">
  import { useZoom } from '@embedpdf/plugin-zoom/svelte';
  import CommandButton from './CommandButton.svelte';

  interface Props {
    documentId: string;
  }

  let { documentId }: Props = $props();

  const zoom = useZoom(() => documentId);

  // Calculate zoom percentage
  const zoomPercentage = $derived(Math.round((zoom.state.currentZoomLevel ?? 1) * 100));

  // Input value state
  let inputValue = $state('100');

  // Sync input value with zoom state when it changes externally
  $effect(() => {
    inputValue = zoomPercentage.toString();
  });

  function handleZoomChange(e: SubmitEvent) {
    e.preventDefault();
    const value = parseFloat(inputValue);

    if (!isNaN(value) && value > 0 && zoom.provides) {
      zoom.provides.requestZoom(value / 100);
    }
  }

  function handleInputChange(e: Event) {
    const target = e.target as HTMLInputElement;
    // Only allow numbers
    const value = target.value.replace(/[^0-9]/g, '');
    inputValue = value;
  }

  function handleBlur() {
    // Reset to actual zoom if input is invalid
    if (!inputValue || parseFloat(inputValue) <= 0) {
      inputValue = zoomPercentage.toString();
    }
  }
</script>

{#if zoom.provides}
  <div class="relative">
    <div class="flex items-center rounded bg-gray-100">
      <!-- Editable Zoom Percentage Input -->
      <form onsubmit={handleZoomChange} class="block">
        <input
          name="zoom"
          type="text"
          inputmode="numeric"
          pattern="\d*"
          class="h-6 w-8 border-0 bg-transparent p-0 text-right text-sm outline-none focus:outline-none"
          aria-label="Set zoom"
          value={inputValue}
          oninput={handleInputChange}
          onblur={handleBlur}
        />
        <span class="text-sm">%</span>
      </form>
      <CommandButton commandId="zoom:toggle-menu" {documentId} itemId="zoom-menu-button" />
      <!-- Zoom Out Button -->
      <CommandButton commandId="zoom:out" {documentId} />
      <!-- Zoom In Button -->
      <CommandButton commandId="zoom:in" {documentId} />
    </div>
  </div>
{/if}
