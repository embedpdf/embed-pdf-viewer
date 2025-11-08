<script lang="ts">
  import { useFullscreen } from '@embedpdf/plugin-fullscreen/svelte';
  import { useExportCapability } from '@embedpdf/plugin-export/svelte';
  import { useLoaderCapability } from '@embedpdf/plugin-loader/svelte';
  import { usePan } from '@embedpdf/plugin-pan/svelte';
  import { useInteractionManager } from '@embedpdf/plugin-interaction-manager/svelte';
  import { clickOutside } from '../actions/click-outside';
  import ZoomToolbar from './ZoomToolbar.svelte';
  import PageSettings from './PageSettings.svelte';

  interface Props {
    isSidebarOpen?: boolean;
    onToggleSidebar?: () => void;
    isSearchOpen?: boolean;
    onToggleSearch?: () => void;
    onOpenPrint?: () => void;
  }

  const {
    isSidebarOpen = false,
    onToggleSidebar,
    isSearchOpen = false,
    onToggleSearch,
    onOpenPrint,
  }: Props = $props();

  const fullscreen = useFullscreen();
  const exportCapability = useExportCapability();
  const loaderCapability = useLoaderCapability();
  const pan = usePan();
  const interactionManager = useInteractionManager();

  let isMenuOpen = $state(false);

  const toggleMenu = () => {
    isMenuOpen = !isMenuOpen;
  };

  const closeMenu = () => {
    isMenuOpen = false;
  };

  const handleOpenFile = () => {
    loaderCapability.provides?.openFileDialog();
    closeMenu();
  };

  const handleDownload = () => {
    exportCapability.provides?.download();
    closeMenu();
  };

  const handlePrint = () => {
    onOpenPrint?.();
    closeMenu();
  };

  const handleFullscreenToggle = () => {
    fullscreen.provides?.toggleFullscreen();
    closeMenu();
  };

  const handlePanMode = () => {
    pan.provides?.togglePan();
  };

  const handlePointerMode = () => {
    interactionManager.provides?.activate('pointerMode');
  };
</script>

<div class="flex w-full items-center gap-3 border-b border-gray-200 bg-gray-50 px-4 py-2">
  <!-- Menu Button -->
  <div class="relative" use:clickOutside={closeMenu}>
    <button
      class="flex h-8 w-8 items-center justify-center text-gray-600 transition-colors {isMenuOpen
        ? 'bg-gray-200 text-gray-900'
        : 'hover:bg-gray-100 hover:text-gray-900'}"
      onclick={toggleMenu}
      title="Menu"
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
        <path d="M4 6l16 0" />
        <path d="M4 12l16 0" />
        <path d="M4 18l16 0" />
      </svg>
    </button>

    {#if isMenuOpen}
      <div
        class="absolute left-0 top-full z-50 mt-2 w-48 origin-top-left rounded border border-gray-200 bg-white shadow-lg"
      >
        <div class="p-1">
          <button
            class="flex w-full items-center justify-start gap-2 px-3 py-1.5 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50"
            onclick={handleOpenFile}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="shrink-0 text-gray-500"
            >
              <path stroke="none" d="M0 0h24v24H0z" fill="none" />
              <path d="M14 3v4a1 1 0 0 0 1 1h4" />
              <path d="M12 21h-5a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v4.5" />
              <path d="M16.5 17.5m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0" />
              <path d="M18.5 19.5l2.5 2.5" />
            </svg>
            <span>Open File</span>
          </button>
          <button
            class="flex w-full items-center justify-start gap-2 px-3 py-1.5 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50"
            onclick={handleDownload}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="shrink-0 text-gray-500"
            >
              <path stroke="none" d="M0 0h24v24H0z" fill="none" />
              <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" />
              <path d="M7 11l5 5l5 -5" />
              <path d="M12 4l0 12" />
            </svg>
            <span>Download</span>
          </button>
          <button
            class="flex w-full items-center justify-start gap-2 px-3 py-1.5 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50"
            onclick={handlePrint}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="shrink-0 text-gray-500"
            >
              <path stroke="none" d="M0 0h24v24H0z" fill="none" />
              <path
                d="M17 17h2a2 2 0 0 0 2 -2v-4a2 2 0 0 0 -2 -2h-14a2 2 0 0 0 -2 2v4a2 2 0 0 0 2 2h2"
              />
              <path d="M17 9v-4a2 2 0 0 0 -2 -2h-6a2 2 0 0 0 -2 2v4" />
              <path
                d="M7 13m0 2a2 2 0 0 1 2 -2h6a2 2 0 0 1 2 2v4a2 2 0 0 1 -2 2h-6a2 2 0 0 1 -2 -2z"
              />
            </svg>
            <span>Print</span>
          </button>
          <button
            class="flex w-full items-center justify-start gap-2 px-3 py-1.5 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50"
            onclick={handleFullscreenToggle}
          >
            {#if fullscreen.state.isFullscreen}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="shrink-0 text-gray-500"
              >
                <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                <path d="M15 19v-2a2 2 0 0 1 2 -2h2" />
                <path d="M15 5v2a2 2 0 0 0 2 2h2" />
                <path d="M5 15h2a2 2 0 0 1 2 2v2" />
                <path d="M5 9h2a2 2 0 0 0 2 -2v-2" />
              </svg>
              <span>Exit Fullscreen</span>
            {:else}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="shrink-0 text-gray-500"
              >
                <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                <path d="M16 4l4 0l0 4" />
                <path d="M14 10l6 -6" />
                <path d="M8 20l-4 0l0 -4" />
                <path d="M4 20l6 -6" />
                <path d="M16 20l4 0l0 -4" />
                <path d="M14 14l6 6" />
                <path d="M8 4l-4 0l0 4" />
                <path d="M4 4l6 6" />
              </svg>
              <span>Fullscreen</span>
            {/if}
          </button>
        </div>
      </div>
    {/if}
  </div>

  <div class="h-6 w-px bg-gray-300"></div>

  <!-- Sidebar Toggle Button -->
  <button
    class="flex h-8 w-8 items-center justify-center text-gray-600 transition-colors {isSidebarOpen
      ? 'bg-gray-200 text-gray-900'
      : 'hover:bg-gray-100 hover:text-gray-900'}"
    onclick={onToggleSidebar}
    title="Toggle Sidebar"
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
      <path d="M4 4m0 2a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z" />
      <path d="M9 4l0 16" />
    </svg>
  </button>

  <div class="h-6 w-px bg-gray-300"></div>

  <PageSettings />
  <div class="h-6 w-px bg-gray-300"></div>
  <ZoomToolbar />

  <div class="h-6 w-px bg-gray-300"></div>

  <!-- Pan Mode Button -->
  <button
    class="flex h-8 w-8 items-center justify-center text-gray-600 transition-colors {pan.isPanning
      ? 'bg-gray-200 text-gray-900'
      : 'hover:bg-gray-100 hover:text-gray-900'}"
    onclick={handlePanMode}
    title="Pan Mode"
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
      <path d="M8 13v-7.5a1.5 1.5 0 0 1 3 0v6.5" />
      <path d="M11 5.5v-2a1.5 1.5 0 1 1 3 0v8.5" />
      <path d="M14 5.5a1.5 1.5 0 0 1 3 0v6.5" />
      <path
        d="M17 7.5a1.5 1.5 0 0 1 3 0v8.5a6 6 0 0 1 -6 6h-2h.208a6 6 0 0 1 -5.012 -2.7a69.74 69.74 0 0 1 -.196 -.3c-.312 -.479 -1.407 -2.388 -3.286 -5.728a1.5 1.5 0 0 1 .536 -2.022a1.867 1.867 0 0 1 2.28 .28l1.47 1.47"
      />
    </svg>
  </button>

  <!-- Pointer Mode Button -->
  <button
    class="flex h-8 w-8 items-center justify-center text-gray-600 transition-colors {interactionManager
      .state.activeMode === 'pointerMode'
      ? 'bg-gray-200 text-gray-900'
      : 'hover:bg-gray-100 hover:text-gray-900'}"
    onclick={handlePointerMode}
    title="Pointer Mode"
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
      <path
        d="M7.904 17.563a1.2 1.2 0 0 0 2.228 .308l2.09 -3.093l4.907 4.907a1.067 1.067 0 0 0 1.509 0l1.047 -1.047a1.067 1.067 0 0 0 0 -1.509l-4.907 -4.907l3.113 -2.09a1.2 1.2 0 0 0 -.309 -2.228l-13.582 -3.904l3.904 13.563z"
      />
    </svg>
  </button>

  <div class="flex-1"></div>

  <!-- Search Toggle Button -->
  <button
    class="flex h-8 w-8 items-center justify-center text-gray-600 transition-colors {isSearchOpen
      ? 'bg-gray-200 text-gray-900'
      : 'hover:bg-gray-100 hover:text-gray-900'}"
    onclick={onToggleSearch}
    title="Toggle Search"
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
      <circle cx="11" cy="11" r="8"></circle>
      <path d="m21 21-4.35-4.35"></path>
    </svg>
  </button>
</div>
