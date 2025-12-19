<script lang="ts">
  import { useExport } from '@embedpdf/plugin-export/svelte';
  import { useCapture } from '@embedpdf/plugin-capture/svelte';
  import { useFullscreen } from '@embedpdf/plugin-fullscreen/svelte';
  import {
    MenuIcon,
    PrintIcon,
    DownloadIcon,
    ScreenshotIcon,
    FullscreenIcon,
    FullscreenExitIcon,
  } from './icons';
  import { ToolbarButton, DropdownMenu, DropdownItem } from './ui';
  import CaptureDialog from './CaptureDialog.svelte';
  import PrintDialog from './PrintDialog.svelte';

  interface DocumentMenuProps {
    documentId: string;
  }

  let { documentId }: DocumentMenuProps = $props();

  const exportPlugin = useExport(() => documentId);
  const capturePlugin = useCapture(() => documentId);
  const fullscreenPlugin = useFullscreen();

  let isMenuOpen = $state(false);
  let isPrintDialogOpen = $state(false);

  const handleDownload = () => {
    exportPlugin.provides?.download();
    isMenuOpen = false;
  };

  const handlePrint = () => {
    isMenuOpen = false;
    isPrintDialogOpen = true;
  };

  const handleScreenshot = () => {
    if (capturePlugin.provides) {
      capturePlugin.provides.toggleMarqueeCapture();
    }
    isMenuOpen = false;
  };

  const handleFullscreen = () => {
    fullscreenPlugin.provides?.toggleFullscreen(`#${documentId}`);
    isMenuOpen = false;
  };
</script>

{#if exportPlugin.provides}
  <div class="relative">
    <ToolbarButton
      onclick={() => (isMenuOpen = !isMenuOpen)}
      isActive={isMenuOpen}
      aria-label="Document Menu"
      title="Document Menu"
    >
      <MenuIcon class="h-4 w-4" />
    </ToolbarButton>

    <DropdownMenu isOpen={isMenuOpen} onClose={() => (isMenuOpen = false)} className="w-48">
      <DropdownItem
        isActive={capturePlugin.state.isMarqueeCaptureActive}
        onclick={handleScreenshot}
      >
        {#snippet icon()}
          <ScreenshotIcon class="h-4 w-4" title="Capture Area" />
        {/snippet}
        Capture Area
      </DropdownItem>
      <DropdownItem onclick={handlePrint}>
        {#snippet icon()}
          <PrintIcon class="h-4 w-4" title="Print" />
        {/snippet}
        Print
      </DropdownItem>
      <DropdownItem onclick={handleDownload}>
        {#snippet icon()}
          <DownloadIcon class="h-4 w-4" title="Download" />
        {/snippet}
        Download
      </DropdownItem>
      <DropdownItem onclick={handleFullscreen}>
        {#snippet icon()}
          {#if fullscreenPlugin.state.isFullscreen}
            <FullscreenExitIcon class="h-4 w-4" title="Exit Fullscreen" />
          {:else}
            <FullscreenIcon class="h-4 w-4" title="Fullscreen" />
          {/if}
        {/snippet}
        {fullscreenPlugin.state.isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
      </DropdownItem>
    </DropdownMenu>
  </div>

  <!-- Print Dialog -->
  <PrintDialog
    {documentId}
    isOpen={isPrintDialogOpen}
    onClose={() => (isPrintDialogOpen = false)}
  />

  <!-- Capture Dialog -->
  <CaptureDialog {documentId} />
{/if}
