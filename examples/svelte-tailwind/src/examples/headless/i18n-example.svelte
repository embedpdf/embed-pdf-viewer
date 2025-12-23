<script lang="ts">
  import { usePdfiumEngine } from '@embedpdf/engines/svelte';
  import { EmbedPDF } from '@embedpdf/core/svelte';
  import { createPluginRegistration, type GlobalStoreState } from '@embedpdf/core';
  import {
    DocumentManagerPluginPackage,
    DocumentContent,
  } from '@embedpdf/plugin-document-manager/svelte';
  import { ViewportPluginPackage } from '@embedpdf/plugin-viewport/svelte';
  import { ScrollPluginPackage } from '@embedpdf/plugin-scroll/svelte';
  import { RenderPluginPackage } from '@embedpdf/plugin-render/svelte';
  import { TilingPluginPackage } from '@embedpdf/plugin-tiling/svelte';
  import { ZoomPluginPackage, ZoomMode, ZOOM_PLUGIN_ID } from '@embedpdf/plugin-zoom/svelte';
  import {
    I18nPluginPackage,
    type Locale,
    type ParamResolvers,
  } from '@embedpdf/plugin-i18n/svelte';
  import { Loader2 } from 'lucide-svelte';
  import I18nExampleContent from './i18n-example-content.svelte';

  const pdfEngine = usePdfiumEngine();

  // Define translations
  const englishLocale: Locale = {
    code: 'en',
    name: 'English',
    translations: {
      zoom: {
        in: 'Zoom In',
        out: 'Zoom Out',
        fitPage: 'Fit to Page',
        level: 'Zoom Level ({level}%)',
      },
      document: {
        title: 'PDF Viewer',
        loading: 'Loading document...',
      },
      toolbar: {
        language: 'Language',
      },
    },
  };

  const spanishLocale: Locale = {
    code: 'es',
    name: 'Español',
    translations: {
      zoom: {
        in: 'Acercar',
        out: 'Alejar',
        fitPage: 'Ajustar a la página',
        level: 'Nivel de zoom ({level}%)',
      },
      document: {
        title: 'Visor de PDF',
        loading: 'Cargando documento...',
      },
      toolbar: {
        language: 'Idioma',
      },
    },
  };

  const germanLocale: Locale = {
    code: 'de',
    name: 'Deutsch',
    translations: {
      zoom: {
        in: 'Vergrößern',
        out: 'Verkleinern',
        fitPage: 'An Seite anpassen',
        level: 'Zoomstufe ({level}%)',
      },
      document: {
        title: 'PDF-Viewer',
        loading: 'Dokument wird geladen...',
      },
      toolbar: {
        language: 'Sprache',
      },
    },
  };

  // Define param resolvers
  type State = GlobalStoreState<{
    [ZOOM_PLUGIN_ID]: any;
  }>;

  const paramResolvers: ParamResolvers<State> = {
    'zoom.level': ({ state, documentId }) => {
      const zoomState = documentId ? state.plugins[ZOOM_PLUGIN_ID]?.documents[documentId] : null;
      const zoomLevel = zoomState?.currentZoomLevel ?? 1;
      return {
        level: Math.round(zoomLevel * 100),
      };
    },
  };

  const plugins = [
    createPluginRegistration(DocumentManagerPluginPackage, {
      initialDocuments: [{ url: 'https://snippet.embedpdf.com/ebook.pdf' }],
    }),
    createPluginRegistration(ViewportPluginPackage),
    createPluginRegistration(ScrollPluginPackage),
    createPluginRegistration(RenderPluginPackage),
    createPluginRegistration(TilingPluginPackage),
    createPluginRegistration(ZoomPluginPackage, {
      defaultZoomLevel: ZoomMode.FitPage,
    }),
    createPluginRegistration(I18nPluginPackage, {
      defaultLocale: 'en',
      locales: [englishLocale, spanishLocale, germanLocale],
      paramResolvers,
    }),
  ];
</script>

{#if pdfEngine.isLoading || !pdfEngine.engine}
  <div
    class="overflow-hidden rounded-lg border border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-900"
  >
    <div class="flex h-[400px] items-center justify-center">
      <div class="flex items-center gap-2 text-gray-500">
        <Loader2 size={20} class="animate-spin" />
        <span class="text-sm">Loading PDF Engine...</span>
      </div>
    </div>
  </div>
{:else}
  <EmbedPDF engine={pdfEngine.engine} {plugins}>
    {#snippet children({ pluginsReady, activeDocumentId })}
      {#if pluginsReady && activeDocumentId}
        <div
          class="overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900"
        >
          <I18nExampleContent documentId={activeDocumentId} />
        </div>
      {:else}
        <div
          class="overflow-hidden rounded-lg border border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-900"
        >
          <div class="flex h-[400px] items-center justify-center">
            <div class="flex items-center gap-2 text-gray-500">
              <Loader2 size={20} class="animate-spin" />
              <span class="text-sm">Initializing plugins...</span>
            </div>
          </div>
        </div>
      {/if}
    {/snippet}
  </EmbedPDF>
{/if}
