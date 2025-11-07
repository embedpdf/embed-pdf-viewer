<template>
  <div class="relative">
    <div class="flex items-center gap-1 rounded bg-gray-100 px-2 py-1">
      <!-- Zoom Out Button -->
      <button
        @click="handleZoomOut"
        class="rounded p-1 text-gray-600 transition-colors hover:bg-gray-200 hover:text-gray-900"
        aria-label="Zoom out"
      >
        <SearchMinusIcon class="h-4 w-4" title="Zoom Out" />
      </button>

      <!-- Zoom Percentage Display -->
      <button
        @click="isMenuOpen = !isMenuOpen"
        class="flex items-center gap-1 rounded px-2 py-0.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200"
      >
        <span>{{ zoomPercentage }}%</span>
        <ChevronDownIcon
          :class="['h-3 w-3 transition-transform', isMenuOpen ? 'rotate-180' : '']"
        />
      </button>

      <!-- Zoom In Button -->
      <button
        @click="handleZoomIn"
        class="rounded p-1 text-gray-600 transition-colors hover:bg-gray-200 hover:text-gray-900"
        aria-label="Zoom in"
      >
        <SearchPlusIcon class="h-4 w-4" title="Zoom In" />
      </button>
    </div>

    <DropdownMenu :isOpen="isMenuOpen" :onClose="() => (isMenuOpen = false)" className="w-48">
      <DropdownItem :onClick="handleZoomIn">
        <template #icon>
          <SearchPlusIcon class="h-4 w-4" title="Zoom In" />
        </template>
        Zoom In
      </DropdownItem>
      <DropdownItem :onClick="handleZoomOut">
        <template #icon>
          <SearchMinusIcon class="h-4 w-4" title="Zoom Out" />
        </template>
        Zoom Out
      </DropdownItem>

      <DropdownDivider />

      <!-- Zoom Presets -->
      <DropdownItem
        v-for="preset in ZOOM_PRESETS"
        :key="preset.value"
        :onClick="() => handleSelectZoom(preset.value)"
        :isActive="Math.abs(state.currentZoomLevel - preset.value) < 0.01"
      >
        {{ preset.label }}
      </DropdownItem>

      <DropdownDivider />

      <!-- Zoom Modes -->
      <DropdownItem
        v-for="mode in ZOOM_MODES"
        :key="mode.value"
        :onClick="() => handleSelectZoom(mode.value)"
        :isActive="state.zoomLevel === mode.value"
      >
        <template #icon>
          <FitPageIcon v-if="mode.value === ZoomMode.FitPage" class="h-4 w-4" title="Fit to Page" />
          <FitWidthIcon v-else class="h-4 w-4" title="Fit to Width" />
        </template>
        {{ mode.label }}
      </DropdownItem>

      <DropdownDivider />

      <DropdownItem :onClick="handleToggleMarquee" :isActive="state.isMarqueeZoomActive">
        <template #icon>
          <MarqueeIcon class="h-4 w-4" title="Marquee Zoom" />
        </template>
        Marquee Zoom
      </DropdownItem>
    </DropdownMenu>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useZoom, ZoomMode } from '@embedpdf/plugin-zoom/vue';
import type { ZoomLevel } from '@embedpdf/plugin-zoom';
import {
  ChevronDownIcon,
  FitPageIcon,
  FitWidthIcon,
  SearchMinusIcon,
  SearchPlusIcon,
  MarqueeIcon,
} from './Icons.vue';
import { DropdownMenu, DropdownItem, DropdownDivider } from './ui';

interface ZoomPreset {
  value: number;
  label: string;
}

interface ZoomModeItem {
  value: ZoomMode;
  label: string;
}

const props = defineProps<{
  documentId: string;
}>();

const ZOOM_PRESETS: ZoomPreset[] = [
  { value: 0.5, label: '50%' },
  { value: 1, label: '100%' },
  { value: 1.5, label: '150%' },
  { value: 2, label: '200%' },
  { value: 4, label: '400%' },
  { value: 8, label: '800%' },
];

const ZOOM_MODES: ZoomModeItem[] = [
  { value: ZoomMode.FitPage, label: 'Fit to Page' },
  { value: ZoomMode.FitWidth, label: 'Fit to Width' },
];

const { state, provides } = useZoom(() => props.documentId);
const isMenuOpen = ref(false);

const zoomPercentage = computed(() => Math.round(state.value.currentZoomLevel * 100));

const handleZoomIn = () => {
  provides.value?.zoomIn();
  isMenuOpen.value = false;
};

const handleZoomOut = () => {
  provides.value?.zoomOut();
  isMenuOpen.value = false;
};

const handleSelectZoom = (value: ZoomLevel) => {
  provides.value?.requestZoom(value);
  isMenuOpen.value = false;
};

const handleToggleMarquee = () => {
  provides.value?.toggleMarqueeZoom();
  isMenuOpen.value = false;
};
</script>
