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
import AnnotationToolbar from './AnnotationToolbar.vue';
import RedactToolbar from './RedactToolbar.vue';

const props = defineProps<{
  leftDrawerOpen: boolean;
  rightDrawerOpen: boolean;
}>();

const emit = defineEmits<{
  (event: 'toggle-left-drawer'): void;
  (event: 'toggle-right-drawer'): void;
}>();

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
  <div class="toolbar bg-white text-dark">
    <div class="toolbar__inner row items-center no-wrap q-px-md q-gutter-sm">
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
      <q-btn
        flat
        round
        dense
        icon="mdi-dock-left"
        :color="props.leftDrawerOpen ? 'primary' : undefined"
        @click="emit('toggle-left-drawer')"
      >
        <q-tooltip>Sidebar</q-tooltip>
      </q-btn>

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
      <q-btn
        flat
        round
        dense
        icon="mdi-magnify"
        :color="props.rightDrawerOpen ? 'primary' : undefined"
        @click="emit('toggle-right-drawer')"
      >
        <q-tooltip>Search</q-tooltip>
      </q-btn>
    </div>
    <div v-if="mode === 'annotate'" class="toolbar__secondary">
      <div class="toolbar__secondary-inner">
        <AnnotationToolbar />
      </div>
    </div>
    <div v-else-if="mode === 'redact'" class="toolbar__secondary">
      <div class="toolbar__secondary-inner">
        <RedactToolbar />
      </div>
    </div>
    <PrintDialog :open="printDialogOpen" @close="handlePrintDialogClose" />
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  flex-direction: column;
  border-bottom: 1px solid var(--q-color-grey-4);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
}

.toolbar__inner {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 56px;
  flex-wrap: nowrap;
}

.toolbar__secondary {
  border-top: 1px solid var(--q-color-grey-4);
  padding: 8px 16px;
}

.toolbar__secondary-inner {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mode-tabs-container {
  display: flex;
  align-items: center;
}
</style>
