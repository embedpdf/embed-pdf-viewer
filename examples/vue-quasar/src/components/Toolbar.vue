<script setup lang="ts">
import { ref } from 'vue';
import { useFullscreen } from '@embedpdf/plugin-fullscreen/vue';
import { usePan } from '@embedpdf/plugin-pan/vue';
import { useRotateCapability } from '@embedpdf/plugin-rotate/vue';
import { useExportCapability } from '@embedpdf/plugin-export/vue';
import { useLoaderCapability } from '@embedpdf/plugin-loader/vue';
import { useSpread, SpreadMode } from '@embedpdf/plugin-spread/vue';
import { useInteractionManager } from '@embedpdf/plugin-interaction-manager/vue';
import PrintDialog from './PrintDialog.vue';
import ZoomControls from './ZoomControls.vue';
import DrawerToggleButton from './drawer-system/DrawerToggleButton.vue';
import AnnotationToolbar from './AnnotationToolbar.vue';
import RedactToolbar from './RedactToolbar.vue';

const { provides: fullscreenProvider, state: fullscreenState } = useFullscreen();
const { provides: panProvider, isPanning } = usePan();
const { provides: rotateProvider } = useRotateCapability();
const { provides: exportProvider } = useExportCapability();
const { provides: loaderProvider } = useLoaderCapability();
const { spreadMode, provides: spreadProvider } = useSpread();
const { provides: pointerProvider, state: interactionManagerState } = useInteractionManager();

// Menu state
const mainMenuOpen = ref(false);
const pageSettingsMenuOpen = ref(false);
const printDialogOpen = ref(false);
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
  loaderProvider?.value?.openFileDialog();
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
  <q-header elevated class="toolbar bg-white text-dark">
    <q-toolbar class="q-px-md q-gutter-sm">
      <!-- Main Menu -->
      <q-btn
        flat
        round
        dense
        icon="mdi-menu"
        :color="mainMenuOpen ? 'primary' : undefined"
      >
        <q-menu v-model="mainMenuOpen" anchor="bottom left" self="top left">
          <q-list dense padding class="q-py-sm">
            <q-item clickable @click="handleOpenFilePicker">
              <q-item-section avatar>
                <q-icon name="mdi-file-document-outline" />
              </q-item-section>
              <q-item-section>Open File</q-item-section>
            </q-item>
            <q-item clickable @click="handleDownload">
              <q-item-section avatar>
                <q-icon name="mdi-download-outline" />
              </q-item-section>
              <q-item-section>Download</q-item-section>
            </q-item>
            <q-item clickable @click="handlePrint">
              <q-item-section avatar>
                <q-icon name="mdi-printer-outline" />
              </q-item-section>
              <q-item-section>Print</q-item-section>
            </q-item>
            <q-item clickable @click="handleFullscreenToggle">
              <q-item-section avatar>
                <q-icon
                  :name="fullscreenState.isFullscreen ? 'mdi-fullscreen-exit' : 'mdi-fullscreen'"
                />
              </q-item-section>
              <q-item-section>
                {{ fullscreenState.isFullscreen ? 'Exit Fullscreen' : 'Fullscreen' }}
              </q-item-section>
            </q-item>
          </q-list>
        </q-menu>
      </q-btn>

      <q-separator vertical spaced />

      <!-- Sidebar Toggle -->
      <DrawerToggleButton component-id="sidebar" />

      <!-- Page Settings Menu -->
      <q-btn
        flat
        round
        dense
        icon="mdi-cog-outline"
        :color="pageSettingsMenuOpen ? 'primary' : undefined"
      >
        <q-menu v-model="pageSettingsMenuOpen" anchor="bottom left" self="top left">
          <q-list dense padding class="q-py-sm">
            <q-item-label header>Page Orientation</q-item-label>
            <q-item clickable @click="handleRotateForward">
              <q-item-section avatar>
                <q-icon name="mdi-rotate-right" />
              </q-item-section>
              <q-item-section>Rotate Clockwise</q-item-section>
            </q-item>
            <q-item clickable @click="handleRotateBackward">
              <q-item-section avatar>
                <q-icon name="mdi-rotate-left" />
              </q-item-section>
              <q-item-section>Rotate Counter-clockwise</q-item-section>
            </q-item>

            <q-separator spaced />

            <q-item-label header>Page Layout</q-item-label>
            <q-item
              clickable
              @click="() => handleSpreadModeChange(SpreadMode.None)"
              :active="spreadMode === SpreadMode.None"
              active-class="text-primary"
            >
              <q-item-section avatar>
                <q-icon name="mdi-file-document-outline" />
              </q-item-section>
              <q-item-section>Single Page</q-item-section>
            </q-item>
            <q-item
              clickable
              @click="() => handleSpreadModeChange(SpreadMode.Odd)"
              :active="spreadMode === SpreadMode.Odd"
              active-class="text-primary"
            >
              <q-item-section avatar>
                <q-icon name="mdi-book-open-page-variant-outline" />
              </q-item-section>
              <q-item-section>Odd Pages</q-item-section>
            </q-item>
            <q-item
              clickable
              @click="() => handleSpreadModeChange(SpreadMode.Even)"
              :active="spreadMode === SpreadMode.Even"
              active-class="text-primary"
            >
              <q-item-section avatar>
                <q-icon name="mdi-book-open-outline" />
              </q-item-section>
              <q-item-section>Even Pages</q-item-section>
            </q-item>

            <q-separator spaced />

            <q-item clickable @click="handleFullscreenToggle">
              <q-item-section avatar>
                <q-icon
                  :name="fullscreenState.isFullscreen ? 'mdi-fullscreen-exit' : 'mdi-fullscreen'"
                />
              </q-item-section>
              <q-item-section>
                {{ fullscreenState.isFullscreen ? 'Exit Fullscreen' : 'Fullscreen' }}
              </q-item-section>
            </q-item>
          </q-list>
        </q-menu>
      </q-btn>

      <q-separator vertical spaced />

      <!-- Zoom Controls -->
      <ZoomControls />

      <q-separator vertical spaced />

      <!-- Pan Mode -->
      <q-btn
        flat
        round
        dense
        icon="mdi-hand-back-left-outline"
        :color="isPanning ? 'primary' : undefined"
        @click="handlePanMode"
      >
        <q-tooltip>Pan Mode</q-tooltip>
      </q-btn>

      <!-- Pointer Mode -->
      <q-btn
        flat
        round
        dense
        icon="mdi-cursor-default-outline"
        :color="interactionManagerState.activeMode === 'pointerMode' ? 'primary' : undefined"
        @click="handlePointerMode"
      >
        <q-tooltip>Pointer Mode</q-tooltip>
      </q-btn>

      <q-space />

      <div class="mode-tabs-container">
        <q-tabs
          v-model="mode"
          dense
          shrink
          indicator-color="primary"
          active-color="primary"
          class="mode-tabs"
        >
          <q-tab name="view" label="View" />
          <q-tab name="annotate" label="Annotate" />
          <q-tab name="redact" label="Redact" />
        </q-tabs>
      </div>

      <q-space />

      <!-- Search Toggle -->
      <DrawerToggleButton component-id="search" />
    </q-toolbar>
    <AnnotationToolbar v-if="mode === 'annotate'" />
    <RedactToolbar v-if="mode === 'redact'" />
  </q-header>

  <!-- Print Dialog -->
  <PrintDialog :open="printDialogOpen" @close="handlePrintDialogClose" />
</template>

<style scoped>
.toolbar {
  border-bottom: 1px solid #cfd4da;
}

.mode-tabs-container {
  display: flex;
  align-items: center;
}

.mode-tabs :deep(.q-tab__label) {
  font-weight: 500;
}
</style>
