<template>
  <div v-if="exportProvider" class="relative">
    <ToolbarButton
      :onClick="() => (isMenuOpen = !isMenuOpen)"
      :isActive="isMenuOpen"
      aria-label="Document Menu"
      title="Document Menu"
    >
      <MenuIcon class="h-4 w-4" />
    </ToolbarButton>

    <DropdownMenu :isOpen="isMenuOpen" :onClose="() => (isMenuOpen = false)" className="w-48">
      <DropdownItem :isActive="captureState.isMarqueeCaptureActive" :onClick="handleScreenshot">
        <template #icon>
          <ScreenshotIcon class="h-4 w-4" title="Capture Area" />
        </template>
        Capture Area
      </DropdownItem>
      <DropdownItem :onClick="handlePrint">
        <template #icon>
          <PrintIcon class="h-4 w-4" title="Print" />
        </template>
        Print
      </DropdownItem>
      <DropdownItem :onClick="handleDownload">
        <template #icon>
          <DownloadIcon class="h-4 w-4" title="Download" />
        </template>
        Download
      </DropdownItem>
      <DropdownItem :onClick="handleFullscreen">
        <template #icon>
          <FullscreenExitIcon
            v-if="fullscreenState.isFullscreen"
            class="h-4 w-4"
            title="Exit Fullscreen"
          />
          <FullscreenIcon v-else class="h-4 w-4" title="Fullscreen" />
        </template>
        {{ fullscreenState.isFullscreen ? 'Exit Fullscreen' : 'Fullscreen' }}
      </DropdownItem>
    </DropdownMenu>
  </div>

  <!-- Print Dialog -->
  <PrintDialog
    :documentId="props.documentId"
    :isOpen="isPrintDialogOpen"
    :onClose="() => (isPrintDialogOpen = false)"
  />

  <!-- Capture Dialog -->
  <CaptureDialog :documentId="props.documentId" />
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useExport } from '@embedpdf/plugin-export/vue';
import { useCapture } from '@embedpdf/plugin-capture/vue';
import { useFullscreen } from '@embedpdf/plugin-fullscreen/vue';
import {
  MenuIcon,
  PrintIcon,
  DownloadIcon,
  ScreenshotIcon,
  FullscreenIcon,
  FullscreenExitIcon,
} from './icons';
import { ToolbarButton, DropdownMenu, DropdownItem } from './ui';
import PrintDialog from './PrintDialog.vue';
import CaptureDialog from './CaptureDialog.vue';

const props = defineProps<{
  documentId: string;
}>();

const { provides: exportProvider } = useExport(() => props.documentId);
const { provides: captureProvider, state: captureState } = useCapture(() => props.documentId);
const { provides: fullscreenProvider, state: fullscreenState } = useFullscreen();
const isMenuOpen = ref(false);
const isPrintDialogOpen = ref(false);

const handleDownload = () => {
  exportProvider.value?.download();
  isMenuOpen.value = false;
};

const handlePrint = () => {
  isMenuOpen.value = false;
  isPrintDialogOpen.value = true;
};

const handleScreenshot = () => {
  captureProvider.value?.toggleMarqueeCapture();
  isMenuOpen.value = false;
};

const handleFullscreen = () => {
  fullscreenProvider.value?.toggleFullscreen(`#${props.documentId}`);
  isMenuOpen.value = false;
};
</script>
