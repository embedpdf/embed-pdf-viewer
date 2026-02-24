<script setup lang="ts">
import { usePdfiumEngine } from '@embedpdf/engines/vue';
import { EmbedPDF } from '@embedpdf/core/vue';
import { createPluginRegistration, type GlobalStoreState } from '@embedpdf/core';
import {
  DocumentManagerPluginPackage,
  DocumentContent,
} from '@embedpdf/plugin-document-manager/vue';
import {
  ViewportPluginPackage,
  VIEWPORT_PLUGIN_ID,
  type ViewportState,
} from '@embedpdf/plugin-viewport/vue';
import {
  ScrollPluginPackage,
  SCROLL_PLUGIN_ID,
  type ScrollState,
  type ScrollPlugin,
} from '@embedpdf/plugin-scroll/vue';
import { RenderPluginPackage } from '@embedpdf/plugin-render/vue';
import {
  ZoomPluginPackage,
  ZoomMode,
  ZOOM_PLUGIN_ID,
  type ZoomState,
} from '@embedpdf/plugin-zoom/vue';
import { CommandsPluginPackage, type Command } from '@embedpdf/plugin-commands/vue';
import { Loader2 } from 'lucide-vue-next';
import CommandsExampleContent from './commands-example-content.vue';

const { engine, isLoading } = usePdfiumEngine();

// Define app state type
export type State = GlobalStoreState<{
  [ZOOM_PLUGIN_ID]: ZoomState;
  [VIEWPORT_PLUGIN_ID]: ViewportState;
  [SCROLL_PLUGIN_ID]: ScrollState;
}>;

// Define Commands
const myCommands: Record<string, Command<State>> = {
  'nav.prev': {
    id: 'nav.prev',
    label: 'Previous Page',
    shortcuts: ['arrowleft', 'k'],
    action: ({ registry, documentId }) => {
      registry
        .getPlugin<ScrollPlugin>('scroll')
        ?.provides()
        ?.forDocument(documentId)
        .scrollToPreviousPage();
    },
    disabled: ({ state, documentId }) => {
      const scrollState = state.plugins.scroll.documents[documentId];
      return scrollState ? scrollState.currentPage <= 1 : true;
    },
  },
  'nav.next': {
    id: 'nav.next',
    label: 'Next Page',
    shortcuts: ['arrowright', 'j'],
    action: ({ registry, documentId }) => {
      registry
        .getPlugin<ScrollPlugin>('scroll')
        ?.provides()
        ?.forDocument(documentId)
        .scrollToNextPage();
    },
    disabled: ({ state, documentId }) => {
      const scrollState = state.plugins.scroll.documents[documentId];
      return scrollState ? scrollState.currentPage >= scrollState.totalPages : true;
    },
  },
  'doc.alert': {
    id: 'doc.alert',
    label: 'Show Info',
    shortcuts: ['ctrl+i', 'meta+i'],
    action: ({ state, documentId }) => {
      const page = state.plugins.scroll.documents[documentId]?.currentPage;
      if (!page) return;
      alert(`You are currently reading page ${page}`);
    },
  },
};

const plugins = [
  createPluginRegistration(DocumentManagerPluginPackage, {
    initialDocuments: [{ url: 'https://snippet.embedpdf.com/ebook.pdf' }],
  }),
  createPluginRegistration(ViewportPluginPackage),
  createPluginRegistration(ScrollPluginPackage),
  createPluginRegistration(RenderPluginPackage),
  createPluginRegistration(ZoomPluginPackage, {
    defaultZoomLevel: ZoomMode.FitPage,
  }),
  createPluginRegistration(CommandsPluginPackage, {
    commands: myCommands,
  }),
];
</script>

<template>
  <div
    v-if="isLoading || !engine"
    class="overflow-hidden rounded-lg border border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-900"
  >
    <div class="flex h-[400px] items-center justify-center">
      <div class="flex items-center gap-2 text-gray-500 dark:text-gray-400">
        <Loader2 :size="20" class="animate-spin" />
        <span class="text-sm">Loading PDF Engine...</span>
      </div>
    </div>
  </div>
  <EmbedPDF v-else :engine="engine" :plugins="plugins" v-slot="{ activeDocumentId }">
    <DocumentContent
      v-if="activeDocumentId"
      :document-id="activeDocumentId"
      v-slot="{ isLoading: docLoading, isLoaded }"
    >
      <div
        v-if="docLoading"
        class="overflow-hidden rounded-lg border border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-900"
      >
        <div class="flex h-[400px] items-center justify-center">
          <div class="flex items-center gap-2 text-gray-500 dark:text-gray-400">
            <Loader2 :size="20" class="animate-spin" />
            <span class="text-sm">Loading document...</span>
          </div>
        </div>
      </div>
      <div
        v-if="isLoaded"
        class="overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900"
      >
        <CommandsExampleContent :document-id="activeDocumentId" />
      </div>
    </DocumentContent>
  </EmbedPDF>
</template>
