<template>
  <Dialog :open="open" :onClose="handleClose" title="Capture PDF Area">
    <DialogContent>
      <div class="flex justify-center">
        <img
          v-if="previewUrl"
          :src="previewUrl"
          @load="handleImageLoad"
          alt="Captured PDF area"
          class="block max-h-[400px] max-w-full rounded border border-gray-200"
        />
      </div>
    </DialogContent>
    <DialogFooter>
      <Button variant="secondary" :onClick="handleClose"> Cancel </Button>
      <Button variant="primary" :onClick="handleDownload" :disabled="!captureData">
        Download
      </Button>
    </DialogFooter>
  </Dialog>

  <!-- Hidden download link -->
  <a ref="downloadLinkRef" style="display: none" href="" download="" />
</template>

<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue';
import { useCapture } from '@embedpdf/plugin-capture/vue';
import { Dialog, DialogContent, DialogFooter, Button } from './ui';

interface CaptureData {
  pageIndex: number;
  rect: any;
  blob: Blob;
}

const props = defineProps<{
  documentId: string;
}>();

const { provides: capture } = useCapture(() => props.documentId);
const open = ref(false);
const captureData = ref<CaptureData | null>(null);
const previewUrl = ref<string | null>(null);
const downloadUrl = ref<string | null>(null);
const urlRef = ref<string | null>(null);
const downloadLinkRef = ref<HTMLAnchorElement | null>(null);

const handleClose = () => {
  // Clean up object URLs
  if (urlRef.value) {
    URL.revokeObjectURL(urlRef.value);
    urlRef.value = null;
  }
  if (downloadUrl.value) {
    URL.revokeObjectURL(downloadUrl.value);
    downloadUrl.value = null;
  }
  open.value = false;
  captureData.value = null;
  previewUrl.value = null;
};

const handleDownload = () => {
  if (!captureData.value || !downloadLinkRef.value) return;

  // Create download URL and trigger download
  const url = URL.createObjectURL(captureData.value.blob);
  downloadUrl.value = url;

  // Use the ref to trigger download
  downloadLinkRef.value.href = url;
  downloadLinkRef.value.download = `pdf-capture-page-${captureData.value.pageIndex + 1}.png`;
  downloadLinkRef.value.click();

  handleClose();
};

const handleImageLoad = () => {
  // Clean up the object URL after image loads
  if (urlRef.value) {
    URL.revokeObjectURL(urlRef.value);
    urlRef.value = null;
  }
};

// Subscribe to capture events
let unsubscribe: (() => void) | undefined;

watch(
  capture,
  (captureProvider) => {
    // Clean up previous subscription
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = undefined;
    }

    if (!captureProvider) return;

    unsubscribe = captureProvider.onCaptureArea(({ pageIndex, rect, blob }) => {
      captureData.value = { pageIndex, rect, blob };

      // Create preview URL
      const objectUrl = URL.createObjectURL(blob);
      urlRef.value = objectUrl;
      previewUrl.value = objectUrl;
      open.value = true;
    });
  },
  { immediate: true },
);

// Clean up on unmount
onUnmounted(() => {
  if (unsubscribe) {
    unsubscribe();
  }
  // Clean up any remaining URLs
  if (urlRef.value) {
    URL.revokeObjectURL(urlRef.value);
  }
  if (downloadUrl.value) {
    URL.revokeObjectURL(downloadUrl.value);
  }
});
</script>
