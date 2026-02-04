<script setup lang="ts">
import { ref, computed, toValue, type MaybeRefOrGetter } from 'vue';
import { useZoom, ZoomMode } from '@embedpdf/plugin-zoom/vue';
import type { ZoomLevel } from '@embedpdf/plugin-zoom';
import { useInteractionManager } from '@embedpdf/plugin-interaction-manager/vue';

interface ZoomControlsProps {
  documentId: string;
}

interface ZoomModeItem {
  value: ZoomLevel;
  label: string;
  icon: string;
}

interface ZoomPresetItem {
  value: number;
  label: string;
}

const props = defineProps<ZoomControlsProps>();

const ZOOM_PRESETS: ZoomPresetItem[] = [
  { value: 0.5, label: '50%' },
  { value: 1, label: '100%' },
  { value: 1.5, label: '150%' },
  { value: 2, label: '200%' },
  { value: 4, label: '400%' },
  { value: 8, label: '800%' },
  { value: 16, label: '1600%' },
];

const ZOOM_MODES: ZoomModeItem[] = [
  { value: ZoomMode.FitPage, label: 'Fit to Page', icon: 'mdi-fit-to-page-outline' },
  { value: ZoomMode.FitWidth, label: 'Fit to Width', icon: 'mdi-arrow-expand-horizontal' },
];

const { state: zoomState, provides: zoomProvider } = useZoom(() => props.documentId);
const { state: interactionManagerState } = useInteractionManager(() => props.documentId);

const menuOpen = ref(false);

const zoomPercentage = computed(() => Math.round(zoomState.value.currentZoomLevel * 100));

const handleMenuItemClick = (value: ZoomLevel) => {
  zoomProvider.value?.requestZoom(value);
  menuOpen.value = false;
};

const handleToggleMarqueeZoom = () => {
  zoomProvider.value?.toggleMarqueeZoom();
  menuOpen.value = false;
};

const handleZoomIn = () => {
  zoomProvider.value?.zoomIn();
};

const handleZoomOut = () => {
  zoomProvider.value?.zoomOut();
};

const isPresetSelected = (value: number) => {
  return Math.abs(zoomState.value.currentZoomLevel - value) < 0.01;
};

const isModeSelected = (value: ZoomLevel) => {
  return zoomState.value.zoomLevel === value;
};

const isMarqueeZoomActive = computed(() => {
  return interactionManagerState.value.activeMode === 'marqueeZoom';
});
</script>

<template>
  <div class="zoom-controls">
    <!-- Zoom Level Display with Menu -->
    <v-menu v-model="menuOpen" :close-on-content-click="false" attach="#pdf-app-layout">
      <template v-slot:activator="{ props }">
        <v-btn
          v-bind="props"
          variant="text"
          size="small"
          class="zoom-display-btn"
          :active="menuOpen"
        >
          <span class="zoom-level">{{ zoomPercentage }}%</span>
          <v-icon size="small" :class="{ 'menu-arrow': true, 'menu-arrow-open': menuOpen }">
            mdi-chevron-down
          </v-icon>
        </v-btn>
      </template>

      <v-list density="compact" class="zoom-menu">
        <!-- Zoom Presets -->
        <template v-for="preset in ZOOM_PRESETS" :key="preset.value">
          <v-list-item
            @click="() => handleMenuItemClick(preset.value)"
            :active="isPresetSelected(preset.value)"
          >
            <v-list-item-title>{{ preset.label }}</v-list-item-title>
          </v-list-item>
        </template>

        <v-divider class="my-1"></v-divider>

        <!-- Zoom Modes -->
        <template v-for="mode in ZOOM_MODES" :key="mode.value">
          <v-list-item
            @click="() => handleMenuItemClick(mode.value)"
            :active="isModeSelected(mode.value)"
          >
            <template v-slot:prepend>
              <v-icon>{{ mode.icon }}</v-icon>
            </template>
            <v-list-item-title>{{ mode.label }}</v-list-item-title>
          </v-list-item>
        </template>

        <v-divider class="my-1"></v-divider>

        <!-- Marquee Zoom -->
        <v-list-item @click="handleToggleMarqueeZoom" :active="isMarqueeZoomActive">
          <template v-slot:prepend>
            <v-icon>mdi-crop-free</v-icon>
          </template>
          <v-list-item-title>Marquee Zoom</v-list-item-title>
        </v-list-item>
      </v-list>
    </v-menu>

    <!-- Zoom Out Button -->
    <v-tooltip text="Zoom Out" location="bottom">
      <template v-slot:activator="{ props }">
        <v-btn
          v-bind="props"
          @click="handleZoomOut"
          icon="mdi-minus-circle-outline"
          variant="text"
          size="small"
        />
      </template>
    </v-tooltip>

    <!-- Zoom In Button -->
    <v-tooltip text="Zoom In" location="bottom">
      <template v-slot:activator="{ props }">
        <v-btn
          v-bind="props"
          @click="handleZoomIn"
          icon="mdi-plus-circle-outline"
          variant="text"
          size="small"
        />
      </template>
    </v-tooltip>
  </div>
</template>

<style scoped>
.zoom-controls {
  display: flex;
  align-items: center;
  background-color: rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  padding: 2px 4px;
}

.zoom-display-btn {
  min-width: auto !important;
  padding: 0 8px !important;
  height: 32px;
}

.zoom-level {
  font-size: 14px;
  font-weight: 500;
  margin-right: 4px;
}

.menu-arrow {
  transition: transform 0.2s ease;
}

.menu-arrow-open {
  transform: rotate(180deg);
}

.zoom-menu {
  min-width: 180px;
}
</style>
