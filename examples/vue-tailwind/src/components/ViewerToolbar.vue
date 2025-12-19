<template>
  <div>
    <!-- Main Toolbar -->
    <div class="flex items-center gap-2 border-b border-gray-300 bg-white px-3 py-2">
      <!-- Left side - Document menu and Thumbnails toggle -->
      <DocumentMenu :documentId="props.documentId" />
      <ToolbarDivider />
      <ToolbarButton
        :onClick="onToggleThumbnails"
        :isActive="isThumbnailsOpen"
        aria-label="Toggle thumbnails"
        title="Toggle Thumbnails"
      >
        <ThumbnailsIcon class="h-4 w-4" />
      </ToolbarButton>
      <PageSettingsMenu :documentId="props.documentId" />

      <!-- Center - Zoom toolbar -->
      <ToolbarDivider />
      <ZoomToolbar :documentId="props.documentId" />
      <ToolbarDivider />

      <PanToggleButton :documentId="props.documentId" />

      <!-- Mode Tabs -->
      <div class="mx-4 flex flex-1 items-center justify-center">
        <div class="flex rounded-lg bg-gray-100 p-1">
          <button
            @click="() => onModeChange('view')"
            :class="[
              'rounded px-4 py-1 text-sm font-medium transition-colors',
              mode === 'view'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900',
            ]"
          >
            View
          </button>
          <button
            @click="() => onModeChange('annotate')"
            :class="[
              'rounded px-4 py-1 text-sm font-medium transition-colors',
              mode === 'annotate'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900',
            ]"
          >
            Annotate
          </button>
          <button
            @click="() => onModeChange('redact')"
            :class="[
              'rounded px-4 py-1 text-sm font-medium transition-colors',
              mode === 'redact'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900',
            ]"
          >
            Redact
          </button>
        </div>
      </div>

      <!-- Right side - Search toggle -->
      <ToolbarButton
        :onClick="onToggleSearch"
        :isActive="isSearchOpen"
        aria-label="Toggle search"
        title="Toggle Search"
      >
        <SearchIcon class="h-4 w-4" />
      </ToolbarButton>
    </div>

    <!-- Redaction Toolbar -->
    <RedactionToolbar v-if="mode === 'redact'" :documentId="props.documentId" />
    <!-- Annotation Toolbar -->
    <AnnotationToolbar v-if="mode === 'annotate'" :documentId="props.documentId" />
  </div>
</template>

<script setup lang="ts">
import { SearchIcon, ThumbnailsIcon } from './icons';
import { ToolbarButton, ToolbarDivider } from './ui';
import ZoomToolbar from './ZoomToolbar.vue';
import PanToggleButton from './PanToggleButton.vue';
import PageSettingsMenu from './PageSettingsMenu.vue';
import DocumentMenu from './DocumentMenu.vue';
import RedactionToolbar from './RedactionToolbar.vue';
import AnnotationToolbar from './AnnotationToolbar.vue';

export type ViewMode = 'view' | 'annotate' | 'redact';

const props = defineProps<{
  documentId: string;
  onToggleSearch: () => void;
  onToggleThumbnails: () => void;
  isSearchOpen: boolean;
  isThumbnailsOpen: boolean;
  mode: ViewMode;
  onModeChange: (mode: ViewMode) => void;
}>();
</script>
