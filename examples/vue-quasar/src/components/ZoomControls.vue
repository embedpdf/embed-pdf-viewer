<script setup lang="ts">
import { ref, computed } from 'vue';
import { useZoom, ZoomMode } from '@embedpdf/plugin-zoom/vue';
import type { ZoomLevel } from '@embedpdf/plugin-zoom';
import { useInteractionManager } from '@embedpdf/plugin-interaction-manager/vue';

interface ZoomModeItem {
  value: ZoomLevel;
  label: string;
  icon: string;
}

interface ZoomPresetItem {
  value: number;
  label: string;
}

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

const { state: zoomState, provides: zoomProvider } = useZoom();
const { state: interactionManagerState } = useInteractionManager();

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
  <div class="zoom-controls row items-center q-gutter-xs">
    <!-- Zoom Level Display with Menu -->
    <q-btn
      flat
      dense
      class="zoom-display-btn row items-center no-wrap"
      :color="menuOpen ? 'primary' : undefined"
    >
      <span class="zoom-level">{{ zoomPercentage }}%</span>
      <q-icon
        size="16px"
        name="mdi-chevron-down"
        :class="{ 'menu-arrow': true, 'menu-arrow-open': menuOpen }"
      />
      <q-menu v-model="menuOpen" anchor="bottom left" self="top left">
        <q-list dense padding class="zoom-menu">
          <!-- Zoom Presets -->
          <q-item
            v-for="preset in ZOOM_PRESETS"
            :key="preset.value"
            clickable
            :active="isPresetSelected(preset.value)"
            active-class="text-primary"
            @click="() => handleMenuItemClick(preset.value)"
          >
            <q-item-section>{{ preset.label }}</q-item-section>
          </q-item>

          <q-separator spaced />

          <!-- Zoom Modes -->
          <q-item
            v-for="mode in ZOOM_MODES"
            :key="mode.value"
            clickable
            :active="isModeSelected(mode.value)"
            active-class="text-primary"
            @click="() => handleMenuItemClick(mode.value)"
          >
            <q-item-section avatar>
              <q-icon :name="mode.icon" />
            </q-item-section>
            <q-item-section>{{ mode.label }}</q-item-section>
          </q-item>

          <q-separator spaced />

          <!-- Marquee Zoom -->
          <q-item
            clickable
            :active="isMarqueeZoomActive"
            active-class="text-primary"
            @click="handleToggleMarqueeZoom"
          >
            <q-item-section avatar>
              <q-icon name="mdi-crop-free" />
            </q-item-section>
            <q-item-section>Marquee Zoom</q-item-section>
          </q-item>
        </q-list>
      </q-menu>
    </q-btn>

    <!-- Zoom Out Button -->
    <q-btn flat round dense icon="mdi-minus-circle-outline" @click="handleZoomOut">
      <q-tooltip>Zoom Out</q-tooltip>
    </q-btn>

    <!-- Zoom In Button -->
    <q-btn flat round dense icon="mdi-plus-circle-outline" @click="handleZoomIn">
      <q-tooltip>Zoom In</q-tooltip>
    </q-btn>
  </div>
</template>

<style scoped>
.zoom-controls {
  background-color: rgba(0, 0, 0, 0.04);
  border-radius: 6px;
  padding: 2px 6px;
}

.zoom-display-btn {
  min-width: auto;
  padding: 0 8px;
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
  min-width: 200px;
}
</style>
