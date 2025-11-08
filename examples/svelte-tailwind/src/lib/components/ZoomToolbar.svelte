<script lang="ts">
  import { useZoom } from '@embedpdf/plugin-zoom/svelte';
  import { useInteractionManager } from '@embedpdf/plugin-interaction-manager/svelte';
  import { ZoomMode } from '@embedpdf/plugin-zoom';
  import { clickOutside } from '../actions/click-outside';

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
    { value: 16, label: '1600%' },
  ];

  const ZOOM_MODES: ZoomModeItem[] = [
    { value: ZoomMode.FitPage, label: 'Fit to Page' },
    { value: ZoomMode.FitWidth, label: 'Fit to Width' },
  ];

  const zoom = useZoom();
  const interaction = useInteractionManager();

  let isMenuOpen = $state(false);

  const toggleMenu = () => {
    isMenuOpen = !isMenuOpen;
  };

  const closeMenu = () => {
    isMenuOpen = false;
  };

  const handleZoomPreset = (value: number) => {
    zoom.provides?.requestZoom(value);
    closeMenu();
  };

  const handleZoomMode = (mode: ZoomMode) => {
    zoom.provides?.requestZoom(mode);
    closeMenu();
  };

  const handleZoomIn = () => {
    zoom.provides?.zoomIn();
  };

  const handleZoomOut = () => {
    zoom.provides?.zoomOut();
  };

  const handleToggleMarqueeZoom = () => {
    zoom.provides?.toggleMarqueeZoom();
    closeMenu();
  };

  const zoomPercentage = $derived(Math.round(zoom.state.currentZoomLevel * 100));
  const isMarqueeActive = $derived(interaction.state.activeMode === 'marqueeZoom');
</script>

<div class="flex items-center gap-2">
  <!-- Zoom Out Button -->
  <button
    class="flex h-8 w-8 items-center justify-center text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
    onclick={handleZoomOut}
    title="Zoom Out"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0" />
      <path d="M7 10l6 0" />
      <path d="M21 21l-6 -6" />
    </svg>
  </button>
  <!-- Zoom In Button -->
  <button
    class="flex h-8 w-8 items-center justify-center text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
    onclick={handleZoomIn}
    title="Zoom In"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0" />
      <path d="M7 10l6 0" />
      <path d="M10 7l0 6" />
      <path d="M21 21l-6 -6" />
    </svg>
  </button>

  <!-- Zoom Level Display with Dropdown -->
  <div class="relative flex items-center" use:clickOutside={closeMenu}>
    <button
      class="flex min-w-[70px] items-center justify-center gap-1 px-2 py-1 text-sm text-gray-700 transition-colors hover:bg-gray-100"
      onclick={toggleMenu}
      title="Zoom Options"
    >
      <span class="font-medium">{zoomPercentage}%</span>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="text-gray-400 transition-transform duration-200 {isMenuOpen ? 'rotate-180' : ''}"
      >
        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
        <path d="M6 9l6 6l6 -6" />
      </svg>
    </button>

    {#if isMenuOpen}
      <div
        class="absolute left-0 top-full z-50 mt-2 w-48 origin-top-left rounded border border-gray-200 bg-white shadow-lg"
      >
        <!-- Preset Zoom Levels -->
        <div class="p-1">
          {#each ZOOM_PRESETS as preset}
            <button
              class="flex w-full items-center justify-between px-3 py-1.5 text-sm transition-colors {Math.abs(
                zoom.state.currentZoomLevel - preset.value,
              ) < 0.01
                ? 'bg-gray-100 text-gray-900'
                : 'text-gray-700 hover:bg-gray-50'}"
              onclick={() => handleZoomPreset(preset.value)}
            >
              <span>{preset.label}</span>
            </button>
          {/each}
        </div>

        <div class="my-1 h-px bg-gray-200"></div>

        <!-- Zoom Modes -->
        <div class="p-1">
          {#each ZOOM_MODES as mode}
            <button
              class="flex w-full items-center justify-between px-3 py-1.5 text-sm transition-colors {zoom
                .state.zoomLevel === mode.value
                ? 'bg-gray-100 text-gray-900'
                : 'text-gray-700 hover:bg-gray-50'}"
              onclick={() => handleZoomMode(mode.value)}
            >
              <span>{mode.label}</span>
            </button>
          {/each}
        </div>
      </div>
    {/if}
  </div>

  <!-- Marquee Zoom Toggle -->
  <button
    class="flex h-8 w-8 items-center justify-center text-gray-600 transition-colors {isMarqueeActive
      ? 'bg-gray-200 text-gray-900'
      : 'hover:bg-gray-100 hover:text-gray-900'}"
    onclick={handleToggleMarqueeZoom}
    title="{isMarqueeActive ? 'Disable' : 'Enable'} Area Zoom"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M15 13v4" />
      <path d="M13 15h4" />
      <path d="M15 15m-5 0a5 5 0 1 0 10 0a5 5 0 1 0 -10 0" />
      <path d="M22 22l-3 -3" />
      <path d="M6 18h-1a2 2 0 0 1 -2 -2v-1" />
      <path d="M3 11v-1" />
      <path d="M3 6v-1a2 2 0 0 1 2 -2h1" />
      <path d="M10 3h1" />
      <path d="M15 3h1a2 2 0 0 1 2 2v1" />
    </svg>
  </button>
</div>
