<script lang="ts">
  import { useZoom } from '@embedpdf/plugin-zoom/svelte';
  import { ZoomMode } from '@embedpdf/plugin-zoom';
  import {
    SearchMinusIcon,
    SearchPlusIcon,
    ChevronDownIcon,
    FitPageIcon,
    FitWidthIcon,
    MarqueeIcon,
  } from './icons';
  import { DropdownMenu, DropdownItem, DropdownDivider } from './ui';

  interface ZoomToolbarProps {
    documentId: string;
  }

  let { documentId }: ZoomToolbarProps = $props();

  interface ZoomPreset {
    value: number;
    label: string;
  }

  interface ZoomModeItem {
    value: ZoomMode;
    label: string;
  }

  const ZOOM_PRESETS: ZoomPreset[] = [
    { value: 0.5, label: '50%' },
    { value: 1, label: '100%' },
    { value: 1.5, label: '150%' },
    { value: 2, label: '200%' },
    { value: 4, label: '400%' },
    { value: 8, label: '800%' },
  ];

  const ZOOM_MODES: ZoomModeItem[] = [
    { value: ZoomMode.FitPage, label: 'Fit to Page' },
    { value: ZoomMode.FitWidth, label: 'Fit to Width' },
  ];

  const zoom = useZoom(() => documentId);

  let isMenuOpen = $state(false);

  const zoomPercentage = $derived(Math.round(zoom.state.currentZoomLevel * 100));

  const handleZoomIn = () => {
    zoom.provides?.zoomIn();
    isMenuOpen = false;
  };

  const handleZoomOut = () => {
    zoom.provides?.zoomOut();
    isMenuOpen = false;
  };

  const handleSelectZoom = (value: number | ZoomMode) => {
    zoom.provides?.requestZoom(value);
    isMenuOpen = false;
  };

  const handleToggleMarquee = () => {
    zoom.provides?.toggleMarqueeZoom();
    isMenuOpen = false;
  };
</script>

{#if zoom.provides}
  <div class="relative">
    <div class="flex items-center gap-1 rounded bg-gray-100 px-2 py-1">
      <!-- Zoom Out Button -->
      <button
        onclick={handleZoomOut}
        class="rounded p-1 text-gray-600 transition-colors hover:bg-gray-200 hover:text-gray-900"
        aria-label="Zoom out"
      >
        <SearchMinusIcon class="h-4 w-4" title="Zoom Out" />
      </button>

      <!-- Zoom Percentage Display -->
      <button
        onclick={() => (isMenuOpen = !isMenuOpen)}
        class="flex items-center gap-1 rounded px-2 py-0.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200"
      >
        <span>{zoomPercentage}%</span>
        <ChevronDownIcon class="h-3 w-3 transition-transform {isMenuOpen ? 'rotate-180' : ''}" />
      </button>

      <!-- Zoom In Button -->
      <button
        onclick={handleZoomIn}
        class="rounded p-1 text-gray-600 transition-colors hover:bg-gray-200 hover:text-gray-900"
        aria-label="Zoom in"
      >
        <SearchPlusIcon class="h-4 w-4" title="Zoom In" />
      </button>
    </div>

    <DropdownMenu isOpen={isMenuOpen} onClose={() => (isMenuOpen = false)} className="w-48">
      <DropdownItem onclick={handleZoomIn}>
        {#snippet icon()}
          <SearchPlusIcon class="h-4 w-4" title="Zoom In" />
        {/snippet}
        Zoom In
      </DropdownItem>
      <DropdownItem onclick={handleZoomOut}>
        {#snippet icon()}
          <SearchMinusIcon class="h-4 w-4" title="Zoom Out" />
        {/snippet}
        Zoom Out
      </DropdownItem>

      <DropdownDivider />

      <!-- Zoom Presets -->
      {#each ZOOM_PRESETS as { value, label }}
        <DropdownItem
          onclick={() => handleSelectZoom(value)}
          isActive={Math.abs(zoom.state.currentZoomLevel - value) < 0.01}
        >
          {label}
        </DropdownItem>
      {/each}

      <DropdownDivider />

      <!-- Zoom Modes -->
      {#each ZOOM_MODES as { value, label }}
        <DropdownItem
          onclick={() => handleSelectZoom(value)}
          isActive={zoom.state.zoomLevel === value}
        >
          {#snippet icon()}
            {#if value === ZoomMode.FitPage}
              <FitPageIcon class="h-4 w-4" title="Fit to Page" />
            {:else}
              <FitWidthIcon class="h-4 w-4" title="Fit to Width" />
            {/if}
          {/snippet}
          {label}
        </DropdownItem>
      {/each}

      <DropdownDivider />

      <DropdownItem onclick={handleToggleMarquee} isActive={zoom.state.isMarqueeZoomActive}>
        {#snippet icon()}
          <MarqueeIcon class="h-4 w-4" title="Marquee Zoom" />
        {/snippet}
        Marquee Zoom
      </DropdownItem>
    </DropdownMenu>
  </div>
{/if}
