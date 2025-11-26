<template>
  <div v-if="error" class="flex h-screen items-center justify-center">
    <div>Error: {{ error.message }}</div>
  </div>

  <div v-else-if="isLoading || !engine" class="flex h-screen items-center justify-center">
    <LoadingSpinner />
  </div>

  <div v-else ref="containerRef" class="flex h-screen flex-1 flex-col overflow-hidden">
    <NavigationBar />

    <div class="flex flex-1 select-none flex-col overflow-hidden">
      <EmbedPDF
        :engine="engine"
        :logger="logger"
        :plugins="plugins"
        @initialized="handleInitialized"
      >
        <template v-slot="{ pluginsReady, activeDocumentId, documentStates }">
          <div v-if="pluginsReady" class="flex h-full flex-col">
            <TabBar :documentStates="documentStates" :activeDocumentId="activeDocumentId" />

            <!-- Schema-driven UI with UIProvider -->
            <UIProvider
              v-if="activeDocumentId"
              :documentId="activeDocumentId"
              :components="uiComponents"
              :renderers="uiRenderers"
            >
              <ViewerLayout :documentId="activeDocumentId" />
            </UIProvider>
            <EmptyState v-else />
          </div>
          <div v-else class="flex h-full items-center justify-center">
            <LoadingSpinner message="Initializing plugins..." />
          </div>
        </template>
      </EmbedPDF>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { EmbedPDF } from '@embedpdf/core/vue';
import { usePdfiumEngine } from '@embedpdf/engines/vue';
import { createPluginRegistration, PluginRegistry } from '@embedpdf/core';
import { ViewportPluginPackage } from '@embedpdf/plugin-viewport/vue';
import { ScrollPluginPackage, ScrollStrategy } from '@embedpdf/plugin-scroll/vue';
import {
  DocumentManagerPluginPackage,
  DocumentManagerPlugin,
} from '@embedpdf/plugin-document-manager/vue';
import { InteractionManagerPluginPackage } from '@embedpdf/plugin-interaction-manager/vue';
import { ZoomMode, ZoomPluginPackage } from '@embedpdf/plugin-zoom/vue';
import { PanPluginPackage } from '@embedpdf/plugin-pan/vue';
import { SpreadMode, SpreadPluginPackage } from '@embedpdf/plugin-spread/vue';
import { RotatePluginPackage } from '@embedpdf/plugin-rotate/vue';
import { RenderPluginPackage } from '@embedpdf/plugin-render/vue';
import { TilingPluginPackage } from '@embedpdf/plugin-tiling/vue';
import { RedactionPluginPackage } from '@embedpdf/plugin-redaction/vue';
import { ExportPluginPackage } from '@embedpdf/plugin-export/vue';
import { PrintPluginPackage } from '@embedpdf/plugin-print/vue';
import { SelectionPluginPackage } from '@embedpdf/plugin-selection/vue';
import { SearchPluginPackage } from '@embedpdf/plugin-search/vue';
import { ThumbnailPluginPackage } from '@embedpdf/plugin-thumbnail/vue';
import { CapturePluginPackage } from '@embedpdf/plugin-capture/vue';
import { FullscreenPluginPackage } from '@embedpdf/plugin-fullscreen/vue';
import { HistoryPluginPackage } from '@embedpdf/plugin-history/vue';
import { AnnotationPluginPackage } from '@embedpdf/plugin-annotation/vue';
import { CommandsPluginPackage } from '@embedpdf/plugin-commands/vue';
import { I18nPluginPackage } from '@embedpdf/plugin-i18n/vue';
import { UIPluginPackage, UIProvider } from '@embedpdf/plugin-ui/vue';
import TabBar from '../components/TabBar.vue';
import LoadingSpinner from '../components/LoadingSpinner.vue';
import NavigationBar from '../components/NavigationBar.vue';
import EmptyState from '../components/EmptyState.vue';
import { ConsoleLogger } from '@embedpdf/models';
import { commands } from '../config/commands';
import { viewerUISchema } from '../config/ui-schema';
import { SchemaToolbar, SchemaPanel, SchemaMenu } from '../ui';
import ZoomToolbar from '../components/ZoomToolbar.vue';
import ThumbnailsSidebar from '../components/ThumbnailsSidebar.vue';
import SearchSidebar from '../components/SearchSidebar.vue';
import OutlineSidebar from '../components/OutlineSidebar.vue';
import {
  dutchTranslations,
  englishTranslations,
  germanTranslations,
  paramResolvers,
  spanishTranslations,
} from '../config';
import ViewerLayout from '../components/ViewerSchemaLayout.vue';
import SchemaSelectionMenu from '../ui/SchemaSelectionMenu.vue';

/**
 * Schema-Driven Viewer Page
 *
 * This viewer demonstrates the power of the UI plugin and schema-driven architecture.
 * Instead of hardcoding the toolbar components, the UI is defined declaratively
 * in the UI schema and rendered dynamically.
 *
 * Benefits:
 * - Declarative UI configuration
 * - Type-safe schema
 * - Easily customizable and extensible
 * - Consistent UI patterns
 * - Separation of concerns
 */

const logger = new ConsoleLogger();
const containerRef = ref<HTMLDivElement | null>(null);

const { engine, isLoading, error } = usePdfiumEngine({
  logger,
});

// Memoize UIProvider props to prevent unnecessary remounts
const uiComponents = computed(() => ({
  'zoom-toolbar': ZoomToolbar,
  'thumbnails-sidebar': ThumbnailsSidebar,
  'search-sidebar': SearchSidebar,
  'outline-sidebar': OutlineSidebar,
}));

const uiRenderers = computed(() => ({
  toolbar: SchemaToolbar,
  panel: SchemaPanel,
  menu: SchemaMenu,
  selectionMenu: SchemaSelectionMenu,
}));

const plugins = computed(() => [
  createPluginRegistration(ViewportPluginPackage, {
    viewportGap: 10,
  }),
  createPluginRegistration(ScrollPluginPackage, {
    defaultStrategy: ScrollStrategy.Vertical,
  }),
  createPluginRegistration(DocumentManagerPluginPackage),
  createPluginRegistration(InteractionManagerPluginPackage),
  createPluginRegistration(ZoomPluginPackage, {
    defaultZoomLevel: ZoomMode.FitPage,
  }),
  createPluginRegistration(PanPluginPackage),
  createPluginRegistration(SpreadPluginPackage, {
    defaultSpreadMode: SpreadMode.None,
  }),
  createPluginRegistration(RotatePluginPackage),
  createPluginRegistration(ExportPluginPackage),
  createPluginRegistration(PrintPluginPackage),
  createPluginRegistration(RenderPluginPackage),
  createPluginRegistration(TilingPluginPackage, {
    tileSize: 768,
    overlapPx: 2.5,
    extraRings: 0,
  }),
  createPluginRegistration(SelectionPluginPackage),
  createPluginRegistration(SearchPluginPackage),
  createPluginRegistration(RedactionPluginPackage),
  createPluginRegistration(CapturePluginPackage),
  createPluginRegistration(HistoryPluginPackage),
  createPluginRegistration(AnnotationPluginPackage),
  createPluginRegistration(FullscreenPluginPackage),
  createPluginRegistration(ThumbnailPluginPackage, {
    width: 120,
    paddingY: 10,
  }),
  // Commands plugin - provides command execution and state management
  createPluginRegistration(CommandsPluginPackage, {
    commands,
  }),
  createPluginRegistration(I18nPluginPackage, {
    defaultLocale: 'nl',
    locales: [englishTranslations, germanTranslations, spanishTranslations, dutchTranslations],
    paramResolvers,
  }),
  // UI plugin - provides schema-driven UI rendering
  createPluginRegistration(UIPluginPackage, {
    schema: viewerUISchema,
  }),
]);

const handleInitialized = async (registry: PluginRegistry) => {
  registry
    ?.getPlugin<DocumentManagerPlugin>(DocumentManagerPlugin.id)
    ?.provides()
    ?.openDocumentUrl({ url: 'https://snippet.embedpdf.com/ebook.pdf' });
};
</script>
