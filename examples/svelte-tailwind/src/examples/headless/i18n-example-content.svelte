<script lang="ts">
  import { DocumentContent } from '@embedpdf/plugin-document-manager/svelte';
  import { Viewport } from '@embedpdf/plugin-viewport/svelte';
  import { Scroller, type RenderPageProps } from '@embedpdf/plugin-scroll/svelte';
  import { RenderLayer } from '@embedpdf/plugin-render/svelte';
  import { TilingLayer } from '@embedpdf/plugin-tiling/svelte';
  import { useZoom, ZoomMode } from '@embedpdf/plugin-zoom/svelte';
  import { useTranslations, useI18nCapability } from '@embedpdf/plugin-i18n/svelte';
  import { Loader2, ZoomIn, ZoomOut, RotateCcw, Globe, ChevronDown } from 'lucide-svelte';

  interface Props {
    documentId: string;
  }

  let { documentId }: Props = $props();

  const i18n = useI18nCapability();
  const { translate, locale } = useTranslations(() => documentId);
  const zoom = useZoom(() => documentId);

  const availableLocales = $derived(i18n.provides?.getAvailableLocales() ?? []);
  const zoomPercentage = $derived(Math.round((zoom.state?.currentZoomLevel ?? 1) * 100));

  const handleLocaleChange = (e: Event) => {
    const target = e.target as HTMLSelectElement;
    i18n.provides?.setLocale(target.value);
  };
</script>

<!-- Toolbar -->
<div
  class="flex flex-wrap items-center justify-between gap-3 border-b border-gray-300 bg-gray-100 px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
>
  <!-- Language Switcher -->
  <div class="flex items-center gap-2">
    <Globe size={14} class="text-gray-600 dark:text-gray-300" />
    <span
      class="hidden text-xs font-medium uppercase tracking-wide text-gray-600 sm:inline dark:text-gray-300"
    >
      {translate('toolbar.language')}
    </span>
    <div class="relative">
      <select
        value={locale}
        onchange={handleLocaleChange}
        class="cursor-pointer appearance-none rounded-md border-0 bg-white py-1.5 pl-3 pr-8 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-gray-300 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600"
      >
        {#each availableLocales as code (code)}
          <option value={code}>
            {i18n.provides?.getLocaleInfo(code)?.name ?? code}
          </option>
        {/each}
      </select>
      <ChevronDown
        size={14}
        class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-600 dark:text-gray-300"
      />
    </div>
  </div>

  <!-- Zoom Controls -->
  {#if zoom.provides}
    <div class="flex items-center gap-1.5">
      <button
        type="button"
        onclick={() => zoom.provides?.zoomOut()}
        class="inline-flex h-8 w-8 items-center justify-center rounded-md bg-white text-gray-600 shadow-sm ring-1 ring-gray-300 transition-all hover:bg-gray-50 hover:text-gray-900 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100"
        title={translate('zoom.out')}
      >
        <ZoomOut size={16} />
      </button>

      <div
        class="min-w-[56px] rounded-md bg-white px-2 py-1 text-center shadow-sm ring-1 ring-gray-300 dark:bg-gray-700 dark:ring-gray-600"
      >
        <span class="font-mono text-sm font-medium text-gray-700 dark:text-gray-300">
          {zoomPercentage}%
        </span>
      </div>

      <button
        type="button"
        onclick={() => zoom.provides?.zoomIn()}
        class="inline-flex h-8 w-8 items-center justify-center rounded-md bg-white text-gray-600 shadow-sm ring-1 ring-gray-300 transition-all hover:bg-gray-50 hover:text-gray-900 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100"
        title={translate('zoom.in')}
      >
        <ZoomIn size={16} />
      </button>

      <button
        type="button"
        onclick={() => zoom.provides?.requestZoom(ZoomMode.FitPage)}
        class="ml-1 inline-flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 shadow-sm ring-1 ring-gray-300 transition-all hover:bg-gray-50 hover:text-gray-900 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100"
        title={translate('zoom.fitPage')}
      >
        <RotateCcw size={14} />
        <span class="hidden sm:inline">{translate('zoom.fitPage')}</span>
      </button>
    </div>
  {/if}
</div>

<!-- PDF Viewer Area -->
<DocumentContent {documentId}>
  {#snippet children(documentContent)}
    {#if documentContent.isLoading}
      <div class="flex h-[400px] items-center justify-center sm:h-[500px]">
        <div class="flex items-center gap-2 text-gray-500 dark:text-gray-400">
          <Loader2 size={20} class="animate-spin" />
          <span class="text-sm">{translate('document.loading')}</span>
        </div>
      </div>
    {:else if documentContent.isLoaded}
      {#snippet renderPage(page: RenderPageProps)}
        <div style:width="{page.width}px" style:height="{page.height}px" style:position="relative">
          <RenderLayer {documentId} pageIndex={page.pageIndex} />
          <TilingLayer {documentId} pageIndex={page.pageIndex} />
        </div>
      {/snippet}
      <div class="relative h-[400px] sm:h-[500px]">
        <Viewport {documentId} class="absolute inset-0 bg-gray-200 dark:bg-gray-800">
          <Scroller {documentId} {renderPage} />
        </Viewport>
      </div>
    {/if}
  {/snippet}
</DocumentContent>
