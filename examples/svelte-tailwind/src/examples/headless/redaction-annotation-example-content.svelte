<script lang="ts">
  import { Viewport } from '@embedpdf/plugin-viewport/svelte';
  import { Scroller, type RenderPageProps } from '@embedpdf/plugin-scroll/svelte';
  import { RenderLayer } from '@embedpdf/plugin-render/svelte';
  import { PagePointerProvider } from '@embedpdf/plugin-interaction-manager/svelte';
  import { SelectionLayer } from '@embedpdf/plugin-selection/svelte';
  import { AnnotationLayer, useAnnotation } from '@embedpdf/plugin-annotation/svelte';
  import { RedactionLayer, RedactionMode, useRedaction } from '@embedpdf/plugin-redaction/svelte';
  import { PdfAnnotationSubtype, type PdfRedactAnnoObject } from '@embedpdf/models';
  import { AlertCircle, Loader2, Check, Crosshair, Trash2 } from 'lucide-svelte';

  // Color options for redaction annotations
  const REDACTION_COLORS = [
    { name: 'Red', value: '#E44234' },
    { name: 'Blue', value: '#2563EB' },
    { name: 'Green', value: '#16A34A' },
    { name: 'Purple', value: '#9333EA' },
  ];

  interface Props {
    documentId: string;
  }

  let { documentId }: Props = $props();

  const redaction = useRedaction(() => documentId);
  const annotation = useAnnotation(() => documentId);
  let isCommitting = $state(false);

  // Get selected REDACT annotation from state
  const selectedRedact = $derived(() => {
    if (!annotation.state.selectedUid) return null;
    const tracked = annotation.state.byUid[annotation.state.selectedUid];
    if (!tracked) return null;
    if (tracked.object.type !== PdfAnnotationSubtype.REDACT) return null;
    return tracked.object as PdfRedactAnnoObject;
  });

  const selectedAnnotationId = $derived(selectedRedact()?.id ?? null);
  const selectedColor = $derived(selectedRedact()?.strokeColor ?? null);
  const isRedactActive = $derived(redaction.state.activeType === RedactionMode.Redact);

  const handleApplyAll = () => {
    if (!redaction.provides || isCommitting) return;
    isCommitting = true;
    redaction.provides.commitAllPending().wait(
      () => {
        isCommitting = false;
      },
      () => {
        isCommitting = false;
      },
    );
  };

  const handleColorChange = (color: string) => {
    const selected = selectedRedact();
    if (!annotation.provides || !selected) return;

    annotation.provides.updateAnnotation(selected.pageIndex, selected.id, {
      strokeColor: color,
      color: color,
    });
  };
</script>

<div
  class="overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900"
  style="user-select: none"
>
  <!-- Toolbar -->
  <div
    class="flex flex-wrap items-center gap-3 border-b border-gray-300 bg-gray-100 px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
  >
    <span class="text-xs font-medium uppercase tracking-wide text-gray-600 dark:text-gray-300">
      Annotation Mode
    </span>
    <div class="h-4 w-px bg-gray-300 dark:bg-gray-600"></div>

    <!-- Unified redact mode button -->
    <button
      type="button"
      onclick={() => redaction.provides?.toggleRedact()}
      class={[
        'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium shadow-sm transition-all',
        isRedactActive
          ? 'bg-blue-500 text-white ring-1 ring-blue-600'
          : 'bg-white text-gray-600 ring-1 ring-gray-300 hover:bg-gray-50 hover:text-gray-900 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100',
      ].join(' ')}
    >
      <Crosshair size={14} />
      <span class="hidden sm:inline">Redact</span>
    </button>

    <!-- Color picker - visible when annotation is selected -->
    {#if selectedAnnotationId}
      <div class="h-4 w-px bg-gray-300 dark:bg-gray-600"></div>
      <div class="flex items-center gap-1.5">
        <span class="text-xs text-gray-500 dark:text-gray-400">Color:</span>
        {#each REDACTION_COLORS as c}
          <button
            type="button"
            onclick={() => handleColorChange(c.value)}
            class={[
              'h-5 w-5 rounded-full transition-all',
              selectedColor === c.value
                ? 'ring-2 ring-offset-1 ring-gray-800 dark:ring-gray-200'
                : 'hover:scale-110',
            ].join(' ')}
            style:background-color={c.value}
            title={c.name}
          ></button>
        {/each}
      </div>
    {/if}

    <div class="h-4 w-px bg-gray-300 dark:bg-gray-600"></div>

    <!-- Pending count and apply -->
    <div class="flex items-center gap-2">
      {#if redaction.state.pendingCount > 0}
        <span
          class="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400"
        >
          <AlertCircle size={14} />
          {redaction.state.pendingCount} pending
        </span>
      {:else}
        <span class="text-xs text-gray-500 dark:text-gray-400">No marks pending</span>
      {/if}
      <button
        type="button"
        onclick={handleApplyAll}
        disabled={redaction.state.pendingCount === 0 || isCommitting}
        class="inline-flex items-center gap-1.5 rounded-md bg-red-500 px-2.5 py-1.5 text-xs font-medium text-white shadow-sm ring-1 ring-red-600 transition-all hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {#if isCommitting}
          <Loader2 size={14} class="animate-spin" />
        {:else}
          <Check size={14} />
        {/if}
        {isCommitting ? 'Applying...' : 'Apply All'}
      </button>
    </div>

    <!-- Hint text -->
    {#if isRedactActive}
      <span class="hidden animate-pulse text-xs text-blue-600 lg:inline dark:text-blue-400">
        Select text or draw a rectangle to mark for redaction
      </span>
    {/if}
  </div>

  <!-- PDF Viewer Area -->
  <div class="relative h-[450px] sm:h-[550px]">
    {#snippet renderPage(page: RenderPageProps)}
      <PagePointerProvider {documentId} pageIndex={page.pageIndex}>
        <RenderLayer
          {documentId}
          pageIndex={page.pageIndex}
          scale={1}
          class="pointer-events-none"
        />
        <SelectionLayer {documentId} pageIndex={page.pageIndex} />
        <!-- AnnotationLayer renders REDACT annotations -->
        <AnnotationLayer {documentId} pageIndex={page.pageIndex}>
          {#snippet selectionMenuSnippet(menuProps)}
            {#if menuProps.selected}
              <span style={menuProps.menuWrapperProps.style} use:menuProps.menuWrapperProps.action>
                <div
                  class="flex gap-1 rounded-lg border border-gray-300 bg-white p-1 shadow-lg dark:border-gray-600 dark:bg-gray-800"
                  style:position="absolute"
                  style:top="{menuProps.rect.size.height + 8}px"
                  style:left="0"
                  style:pointer-events="auto"
                >
                  <button
                    type="button"
                    onclick={() =>
                      annotation.provides?.deleteAnnotation(
                        menuProps.context.pageIndex,
                        menuProps.context.annotation.object.id,
                      )}
                    class="inline-flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 ring-1 ring-gray-300 transition-colors hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-200 dark:ring-gray-600 dark:hover:bg-gray-600"
                  >
                    <Trash2 size={12} />
                    Delete
                  </button>
                </div>
              </span>
            {/if}
          {/snippet}
        </AnnotationLayer>
        <!-- RedactionLayer renders marquee/selection UI -->
        <RedactionLayer {documentId} pageIndex={page.pageIndex} />
      </PagePointerProvider>
    {/snippet}
    <Viewport {documentId} class="absolute inset-0 bg-gray-200 dark:bg-gray-800">
      <Scroller {documentId} {renderPage} />
    </Viewport>
  </div>
</div>
