<script lang="ts">
  import { useCapture } from '@embedpdf/plugin-capture/svelte';
  import { Dialog, DialogContent, DialogFooter, Button } from './ui';

  interface CaptureData {
    pageIndex: number;
    rect: any;
    blob: Blob;
  }

  interface CaptureDialogProps {
    documentId: string;
  }

  let { documentId }: CaptureDialogProps = $props();

  const capturePlugin = useCapture(() => documentId);

  let open = $state(false);
  let captureData = $state<CaptureData | null>(null);
  let previewUrl = $state<string | null>(null);
  let downloadUrl = $state<string | null>(null);
  let urlRef: string | null = null;
  let downloadLinkRef: HTMLAnchorElement | null = null;

  const handleClose = () => {
    // Clean up object URLs
    if (urlRef) {
      URL.revokeObjectURL(urlRef);
      urlRef = null;
    }
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
      downloadUrl = null;
    }
    open = false;
    captureData = null;
    previewUrl = null;
  };

  const handleDownload = () => {
    if (!captureData || !downloadLinkRef) return;

    // Create download URL and trigger download
    const url = URL.createObjectURL(captureData.blob);
    downloadUrl = url;

    // Use the ref to trigger download
    downloadLinkRef.href = url;
    downloadLinkRef.download = `pdf-capture-page-${captureData.pageIndex + 1}.png`;
    downloadLinkRef.click();

    handleClose();
  };

  $effect(() => {
    if (!capturePlugin.provides) return;

    return capturePlugin.provides.onCaptureArea(({ pageIndex, rect, blob }) => {
      captureData = { pageIndex, rect, blob };

      // Create preview URL
      const objectUrl = URL.createObjectURL(blob);
      urlRef = objectUrl;
      previewUrl = objectUrl;
      open = true;
    });
  });

  const handleImageLoad = () => {
    // Clean up the object URL after image loads
    if (urlRef) {
      URL.revokeObjectURL(urlRef);
      urlRef = null;
    }
  };
</script>

<Dialog {open} onClose={handleClose} title="Capture PDF Area">
  <DialogContent>
    <div class="flex justify-center">
      {#if previewUrl}
        <img
          src={previewUrl}
          onload={handleImageLoad}
          alt="Captured PDF area"
          class="block max-h-[400px] max-w-full rounded border border-gray-200"
        />
      {/if}
    </div>
  </DialogContent>
  <DialogFooter>
    <Button variant="secondary" onclick={handleClose}>Cancel</Button>
    <Button variant="primary" onclick={handleDownload} disabled={!captureData}>Download</Button>
  </DialogFooter>
</Dialog>

<!-- Hidden download link -->
<a bind:this={downloadLinkRef} style="display: none" href="" download=""><!-- hidden --></a>
