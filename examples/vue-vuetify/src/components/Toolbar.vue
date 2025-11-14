<script setup lang="ts">
import { ref } from 'vue';
import { useFullscreen } from '@embedpdf/plugin-fullscreen/vue';
import { usePan } from '@embedpdf/plugin-pan/vue';
import { useRotateCapability } from '@embedpdf/plugin-rotate/vue';
import { useExportCapability } from '@embedpdf/plugin-export/vue';
import { useDocumentManagerCapability } from '@embedpdf/plugin-document-manager/vue';
import { useSpread, SpreadMode } from '@embedpdf/plugin-spread/vue';
import { useInteractionManager } from '@embedpdf/plugin-interaction-manager/vue';
import PrintDialog from './PrintDialog.vue';
import ZoomControls from './ZoomControls.vue';
import DrawerToggleButton from './drawer-system/DrawerToggleButton.vue';
import RedactToolbar from './RedactToolbar.vue';
import AnnotationToolbar from './AnnotationToolbar.vue';

interface ToolbarProps {
  documentId: string;
}

const props = defineProps<ToolbarProps>();

const { provides: fullscreenProvider, state: fullscreenState } = useFullscreen();
const { provides: panProvider, isPanning } = usePan(() => props.documentId);
const { provides: rotateProvider } = useRotateCapability();
const { provides: exportProvider } = useExportCapability();
const { provides: documentManagerProvider } = useDocumentManagerCapability();
const { spreadMode, provides: spreadProvider } = useSpread(() => props.documentId);
const { provides: pointerProvider, state: interactionManagerState } = useInteractionManager(
  () => props.documentId,
);

// Menu state
const mainMenuOpen = ref(false);
const pageSettingsMenuOpen = ref(false);
const printDialogOpen = ref(false);

// View/Annotate/Redact mode
const mode = ref<'view' | 'annotate' | 'redact'>('view');

const handleFullscreenToggle = () => {
  fullscreenProvider?.value?.toggleFullscreen();
  mainMenuOpen.value = false;
  pageSettingsMenuOpen.value = false;
};

const handlePanMode = () => {
  panProvider?.value?.togglePan();
};

const handlePointerMode = () => {
  pointerProvider?.value?.activate('pointerMode');
};

const handleRotateForward = () => {
  rotateProvider?.value?.rotateForward();
  pageSettingsMenuOpen.value = false;
};

const handleRotateBackward = () => {
  rotateProvider?.value?.rotateBackward();
  pageSettingsMenuOpen.value = false;
};

const handleDownload = () => {
  exportProvider?.value?.download();
  mainMenuOpen.value = false;
};

const handleOpenFilePicker = () => {
  documentManagerProvider?.value?.openFileDialog();
  mainMenuOpen.value = false;
};

const handleSpreadModeChange = (mode: SpreadMode) => {
  spreadProvider?.value?.setSpreadMode(mode);
  pageSettingsMenuOpen.value = false;
};

const handlePrint = () => {
  printDialogOpen.value = true;
  mainMenuOpen.value = false;
};

const handlePrintDialogClose = () => {
  printDialogOpen.value = false;
};
</script>

<template>
  <v-app-bar elevation="0" density="compact" color="surface" class="toolbar">
    <!-- Main Menu -->
    <v-menu v-model="mainMenuOpen" :close-on-content-click="false" attach="#pdf-app-layout">
      <template v-slot:activator="{ props }">
        <v-btn v-bind="props" icon="mdi-menu" variant="text" size="small" :active="mainMenuOpen" />
      </template>
      <v-list density="compact">
        <v-list-item @click="handleOpenFilePicker">
          <template v-slot:prepend>
            <v-icon>mdi-file-document-outline</v-icon>
          </template>
          <v-list-item-title>Open File</v-list-item-title>
        </v-list-item>
        <v-list-item @click="handleDownload">
          <template v-slot:prepend>
            <v-icon>mdi-download-outline</v-icon>
          </template>
          <v-list-item-title>Download</v-list-item-title>
        </v-list-item>
        <v-list-item @click="handlePrint">
          <template v-slot:prepend>
            <v-icon>mdi-printer-outline</v-icon>
          </template>
          <v-list-item-title>Print</v-list-item-title>
        </v-list-item>
        <v-list-item @click="handleFullscreenToggle">
          <template v-slot:prepend>
            <v-icon>
              {{ fullscreenState.isFullscreen ? 'mdi-fullscreen-exit' : 'mdi-fullscreen' }}
            </v-icon>
          </template>
          <v-list-item-title>
            {{ fullscreenState.isFullscreen ? 'Exit Fullscreen' : 'Fullscreen' }}
          </v-list-item-title>
        </v-list-item>
      </v-list>
    </v-menu>

    <v-divider vertical class="mx-3 my-3"></v-divider>

    <!-- Sidebar Toggle (placeholder) -->
    <DrawerToggleButton component-id="sidebar" />

    <!-- Page Settings Menu -->
    <v-menu v-model="pageSettingsMenuOpen" :close-on-content-click="false" attach="#pdf-app-layout">
      <template v-slot:activator="{ props }">
        <v-btn
          v-bind="props"
          icon="mdi-cog-outline"
          variant="text"
          size="small"
          :active="pageSettingsMenuOpen"
        />
      </template>
      <v-list density="compact">
        <v-list-subheader>Page Orientation</v-list-subheader>
        <v-list-item @click="handleRotateForward">
          <template v-slot:prepend>
            <v-icon>mdi-rotate-right</v-icon>
          </template>
          <v-list-item-title>Rotate Clockwise</v-list-item-title>
        </v-list-item>
        <v-list-item @click="handleRotateBackward">
          <template v-slot:prepend>
            <v-icon>mdi-rotate-left</v-icon>
          </template>
          <v-list-item-title>Rotate Counter-clockwise</v-list-item-title>
        </v-list-item>

        <v-divider class="my-1"></v-divider>

        <v-list-subheader>Page Layout</v-list-subheader>
        <v-list-item
          @click="() => handleSpreadModeChange(SpreadMode.None)"
          :active="spreadMode === SpreadMode.None"
        >
          <template v-slot:prepend>
            <v-icon>mdi-file-document-outline</v-icon>
          </template>
          <v-list-item-title>Single Page</v-list-item-title>
        </v-list-item>
        <v-list-item
          @click="() => handleSpreadModeChange(SpreadMode.Odd)"
          :active="spreadMode === SpreadMode.Odd"
        >
          <template v-slot:prepend>
            <v-icon>mdi-book-open-page-variant-outline</v-icon>
          </template>
          <v-list-item-title>Odd Pages</v-list-item-title>
        </v-list-item>
        <v-list-item
          @click="() => handleSpreadModeChange(SpreadMode.Even)"
          :active="spreadMode === SpreadMode.Even"
        >
          <template v-slot:prepend>
            <v-icon>mdi-book-open-outline</v-icon>
          </template>
          <v-list-item-title>Even Pages</v-list-item-title>
        </v-list-item>

        <v-divider class="my-1"></v-divider>

        <v-list-item @click="handleFullscreenToggle">
          <template v-slot:prepend>
            <v-icon>
              {{ fullscreenState.isFullscreen ? 'mdi-fullscreen-exit' : 'mdi-fullscreen' }}
            </v-icon>
          </template>
          <v-list-item-title>
            {{ fullscreenState.isFullscreen ? 'Exit Fullscreen' : 'Fullscreen' }}
          </v-list-item-title>
        </v-list-item>
      </v-list>
    </v-menu>

    <v-divider vertical class="mx-3 my-3"></v-divider>

    <!-- Zoom Controls -->
    <ZoomControls :documentId="props.documentId" />

    <v-divider vertical class="mx-3 my-3"></v-divider>

    <!-- Pan Mode -->
    <v-tooltip text="Pan Mode" location="bottom">
      <template v-slot:activator="{ props }">
        <v-btn
          v-bind="props"
          @click="handlePanMode"
          icon="mdi-hand-back-left-outline"
          variant="text"
          size="small"
          :active="isPanning"
        />
      </template>
    </v-tooltip>

    <!-- Pointer Mode -->
    <v-tooltip text="Pointer Mode" location="bottom">
      <template v-slot:activator="{ props }">
        <v-btn
          v-bind="props"
          @click="handlePointerMode"
          icon="mdi-cursor-default-outline"
          variant="text"
          size="small"
          :active="interactionManagerState.activeMode === 'pointerMode'"
        />
      </template>
    </v-tooltip>

    <!-- Mode Tabs -->
    <v-spacer></v-spacer>
    <div class="mode-tabs-container">
      <v-tabs v-model="mode" color="primary" density="compact" class="mode-tabs">
        <v-tab value="view">View</v-tab>
        <v-tab value="annotate">Annotate</v-tab>
        <v-tab value="redact">Redact</v-tab>
      </v-tabs>
    </div>
    <v-spacer></v-spacer>

    <!-- Search Toggle -->
    <DrawerToggleButton component-id="search" />
  </v-app-bar>

  <!-- Conditional Toolbars -->
  <RedactToolbar v-if="mode === 'redact'" :documentId="props.documentId" />
  <AnnotationToolbar v-if="mode === 'annotate'" :documentId="props.documentId" />

  <!-- Print Dialog -->
  <PrintDialog
    :open="printDialogOpen"
    :documentId="props.documentId"
    @close="handlePrintDialogClose"
  />
</template>

<style scoped>
.toolbar {
  border-bottom: 1px solid #cfd4da;
  padding: 0 12px;
}
</style>
