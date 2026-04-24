<script lang="ts">
  import { Viewport } from '@embedpdf/plugin-viewport/svelte';
  import { Scroller, type RenderPageProps } from '@embedpdf/plugin-scroll/svelte';
  import { RenderLayer } from '@embedpdf/plugin-render/svelte';
  import { TilingLayer } from '@embedpdf/plugin-tiling/svelte';
  import { AnnotationLayer, useAnnotation } from '@embedpdf/plugin-annotation/svelte';
  import { PagePointerProvider } from '@embedpdf/plugin-interaction-manager/svelte';
  import { SelectionLayer } from '@embedpdf/plugin-selection/svelte';
  import { Rotate, useRotate } from '@embedpdf/plugin-rotate/svelte';
  import { useZoom, ZoomMode } from '@embedpdf/plugin-zoom/svelte';
  import type { PdfAnnotationFlagName } from '@embedpdf/models';
  import { MousePointerClick, RotateCcw, RotateCw, Trash2, ZoomIn, ZoomOut } from 'lucide-svelte';
  import { DEMO_ANNOTATIONS, DEMO_PAGE_INDEX } from './annotation-flags-example-seeds';

  interface Props {
    documentId: string;
  }

  let { documentId }: Props = $props();

  const TOGGLEABLE_FLAGS: Array<{
    flag: PdfAnnotationFlagName;
    description: string;
  }> = [
    { flag: 'hidden', description: 'not rendered, not selectable' },
    { flag: 'noView', description: 'not rendered, not selectable, still printable' },
    { flag: 'readOnly', description: 'rendered but no interaction' },
    { flag: 'locked', description: 'selectable but cannot be moved / resized / rotated' },
    { flag: 'lockedContents', description: 'selectable and movable but text cannot be edited' },
  ];

  const annotation = useAnnotation(() => documentId);
  const zoom = useZoom(() => documentId);
  const rotate = useRotate(() => documentId);

  const selectedId = $derived(annotation.state.selectedUids[0] ?? null);
  const tracked = $derived(selectedId ? (annotation.state.byUid[selectedId] ?? null) : null);
  const selectedLabel = $derived(
    selectedId ? (DEMO_ANNOTATIONS.find((a) => a.id === selectedId)?.label ?? null) : null,
  );
  const currentFlags = $derived<PdfAnnotationFlagName[]>(tracked?.object.flags ?? []);
  const flagEditorDisabled = $derived(!tracked || !annotation.provides);
  const zoomPercentage = $derived(Math.round((zoom.state.currentZoomLevel ?? 1) * 100));
  const rotationDegrees = $derived(rotate.rotation * 90);

  const toggleFlag = (flag: PdfAnnotationFlagName) => {
    const api = annotation.provides;
    const t = tracked;
    if (!api || !t) return;
    const flags = currentFlags;
    const next = flags.includes(flag) ? flags.filter((f) => f !== flag) : [...flags, flag];
    api.updateAnnotation(DEMO_PAGE_INDEX, t.object.id, { flags: next });
  };

  const clearFlags = () => {
    const api = annotation.provides;
    const t = tracked;
    if (!api || !t || currentFlags.length === 0) return;
    api.updateAnnotation(DEMO_PAGE_INDEX, t.object.id, { flags: [] });
  };

  const restoreDemo = () => {
    const api = annotation.provides;
    if (!api) return;
    for (const { id, seed } of DEMO_ANNOTATIONS) {
      const existing = api.getAnnotationById(id);
      if (existing) {
        api.updateAnnotation(DEMO_PAGE_INDEX, id, { flags: [] });
      } else {
        api.createAnnotation(DEMO_PAGE_INDEX, seed);
      }
    }
  };

  const handleDeleteFromMenu = (pageIndex: number, id: string, locked: boolean) => {
    if (locked) return;
    annotation.provides?.deleteAnnotation(pageIndex, id);
  };

  const statusLabelFor = (structurallyLocked: boolean, contentLocked: boolean) => {
    if (structurallyLocked) {
      return contentLocked ? 'structurally + content locked' : 'structurally locked';
    }
    return contentLocked ? 'content locked' : 'interactive';
  };
</script>

<div
  class="overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900"
  style="user-select: none"
>
  <!-- Toolbar -->
  <div
    class="flex flex-col gap-3 border-b border-gray-300 bg-gray-100 px-3 py-3 dark:border-gray-700 dark:bg-gray-800"
  >
    <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
      <!-- Zoom controls -->
      {#if zoom.provides}
        <div class="flex items-center gap-1.5">
          <button
            type="button"
            onclick={() => zoom.provides?.zoomOut()}
            class="inline-flex h-7 w-7 items-center justify-center rounded-md bg-white text-gray-600 shadow-sm ring-1 ring-gray-300 transition-all hover:bg-gray-50 hover:text-gray-900 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100"
            title="Zoom out"
          >
            <ZoomOut size={14} />
          </button>
          <div
            class="min-w-[52px] rounded-md bg-white px-2 py-0.5 text-center shadow-sm ring-1 ring-gray-300 dark:bg-gray-700 dark:ring-gray-600"
          >
            <span class="font-mono text-xs font-medium text-gray-700 dark:text-gray-200">
              {zoomPercentage}%
            </span>
          </div>
          <button
            type="button"
            onclick={() => zoom.provides?.zoomIn()}
            class="inline-flex h-7 w-7 items-center justify-center rounded-md bg-white text-gray-600 shadow-sm ring-1 ring-gray-300 transition-all hover:bg-gray-50 hover:text-gray-900 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100"
            title="Zoom in"
          >
            <ZoomIn size={14} />
          </button>
          <button
            type="button"
            onclick={() => zoom.provides?.requestZoom(ZoomMode.FitPage)}
            class="ml-1 inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-xs font-medium text-gray-600 shadow-sm ring-1 ring-gray-300 transition-all hover:bg-gray-50 hover:text-gray-900 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100"
            title="Fit page"
          >
            <span>Fit</span>
          </button>
        </div>
      {/if}

      <div class="h-4 w-px bg-gray-300 dark:bg-gray-600"></div>

      <!-- Rotate controls -->
      {#if rotate.provides}
        <div class="flex items-center gap-1.5">
          <button
            type="button"
            onclick={() => rotate.provides?.rotateBackward()}
            class="inline-flex h-7 w-7 items-center justify-center rounded-md bg-white text-gray-600 shadow-sm ring-1 ring-gray-300 transition-all hover:bg-gray-50 hover:text-gray-900 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100"
            title="Rotate counter-clockwise"
          >
            <RotateCcw size={14} />
          </button>
          <div
            class="min-w-[52px] rounded-md bg-white px-2 py-0.5 text-center shadow-sm ring-1 ring-gray-300 dark:bg-gray-700 dark:ring-gray-600"
          >
            <span class="font-mono text-xs font-medium text-gray-700 dark:text-gray-300">
              {rotationDegrees}°
            </span>
          </div>
          <button
            type="button"
            onclick={() => rotate.provides?.rotateForward()}
            class="inline-flex h-7 w-7 items-center justify-center rounded-md bg-white text-gray-600 shadow-sm ring-1 ring-gray-300 transition-all hover:bg-gray-50 hover:text-gray-900 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100"
            title="Rotate clockwise"
          >
            <RotateCw size={14} />
          </button>
        </div>
      {/if}

      <div class="ml-auto">
        <button
          type="button"
          onclick={restoreDemo}
          class="inline-flex items-center gap-1.5 rounded-md bg-gray-700 px-2.5 py-1.5 text-xs font-medium text-white shadow-sm transition-all hover:bg-gray-800 dark:bg-gray-600 dark:hover:bg-gray-500"
          title="Clear flags and restore all demo annotations"
        >
          <RotateCcw size={14} />
          <span>Reset demo</span>
        </button>
      </div>
    </div>

    <!-- Flag editor: single panel driven by the current selection -->
    <div
      class="rounded-md border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900"
    >
      <div class="mb-2 flex items-center justify-between gap-2">
        <div class="flex min-w-0 items-center gap-2">
          {#if tracked}
            <span
              class="inline-block h-2 w-2 shrink-0 rounded-full bg-emerald-500"
              aria-hidden="true"
            ></span>
            <span class="truncate text-xs font-semibold text-gray-800 dark:text-gray-100">
              {selectedLabel ?? 'Selected annotation'}
            </span>
            <code
              class="hidden shrink-0 rounded bg-gray-50 px-1.5 py-0.5 font-mono text-[10px] text-gray-500 ring-1 ring-gray-200 sm:inline dark:bg-gray-800 dark:text-gray-400 dark:ring-gray-700"
            >
              flags: [{currentFlags.join(', ')}]
            </code>
          {:else}
            <MousePointerClick
              size={14}
              class="shrink-0 text-gray-400 dark:text-gray-500"
              aria-hidden="true"
            />
            <span class="text-xs font-medium text-gray-500 dark:text-gray-400">
              Click an annotation on the page to edit its flags
            </span>
          {/if}
        </div>
        <button
          type="button"
          onclick={clearFlags}
          disabled={flagEditorDisabled || currentFlags.length === 0}
          class="inline-flex shrink-0 items-center gap-1 rounded-md bg-white px-2 py-1 text-[11px] font-medium text-gray-600 shadow-sm ring-1 ring-gray-300 transition-all hover:bg-gray-50 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white disabled:hover:text-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100 dark:disabled:hover:bg-gray-700 dark:disabled:hover:text-gray-300"
          title="Clear all flags on the selected annotation"
        >
          Clear flags
        </button>
      </div>

      <div class="grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-5">
        {#each TOGGLEABLE_FLAGS as { flag, description } (flag)}
          <button
            type="button"
            onclick={() => toggleFlag(flag)}
            disabled={flagEditorDisabled}
            title={description}
            class={[
              'flex flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left text-xs font-medium shadow-sm transition-all disabled:cursor-not-allowed disabled:opacity-40',
              currentFlags.includes(flag)
                ? 'bg-blue-500 text-white ring-1 ring-blue-600 hover:bg-blue-600'
                : 'bg-white text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50 hover:text-gray-900 dark:bg-gray-800 dark:text-gray-200 dark:ring-gray-700 dark:hover:bg-gray-700',
            ].join(' ')}
          >
            <span class="font-mono text-[11px]">{flag}</span>
            <span
              class={[
                'text-[10px] font-normal leading-tight',
                currentFlags.includes(flag) ? 'text-blue-50' : 'text-gray-500 dark:text-gray-400',
              ].join(' ')}
            >
              {description}
            </span>
          </button>
        {/each}
      </div>
    </div>
  </div>

  <!-- PDF Viewer Area -->
  <div class="relative h-[500px] sm:h-[600px]">
    {#snippet renderPage(page: RenderPageProps)}
      <Rotate {documentId} pageIndex={page.pageIndex}>
        <PagePointerProvider {documentId} pageIndex={page.pageIndex}>
          <RenderLayer
            {documentId}
            pageIndex={page.pageIndex}
            scale={1}
            class="pointer-events-none"
          />
          <TilingLayer {documentId} pageIndex={page.pageIndex} class="pointer-events-none" />
          <SelectionLayer {documentId} pageIndex={page.pageIndex} />
          <AnnotationLayer {documentId} pageIndex={page.pageIndex}>
            {#snippet selectionMenuSnippet({
              selected,
              context,
              menuWrapperProps,
              rect,
              placement,
            })}
              {#if selected}
                <span style={menuWrapperProps.style} use:menuWrapperProps.action>
                  <div
                    class="flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-1.5 py-1 text-xs shadow-md dark:border-gray-700 dark:bg-gray-800"
                    style:position="absolute"
                    style:pointer-events="auto"
                    style:cursor="default"
                    style:top={placement.suggestTop ? '-40px' : `${rect.size.height + 8}px`}
                  >
                    <button
                      type="button"
                      onclick={() =>
                        handleDeleteFromMenu(
                          context.annotation.object.pageIndex,
                          context.annotation.object.id,
                          context.structurallyLocked,
                        )}
                      disabled={context.structurallyLocked}
                      title={context.structurallyLocked
                        ? 'Locked — cannot delete'
                        : 'Delete annotation'}
                      class="inline-flex h-6 w-6 items-center justify-center rounded text-gray-600 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-gray-600 dark:text-gray-300 dark:hover:bg-red-500/20 dark:hover:text-red-400 dark:disabled:hover:text-gray-300"
                      aria-label="Delete annotation"
                    >
                      <Trash2 size={13} />
                    </button>
                    <span
                      class="border-l border-gray-200 pl-2 font-mono text-[10px] tracking-tight text-gray-500 dark:border-gray-700 dark:text-gray-400"
                    >
                      {statusLabelFor(context.structurallyLocked, context.contentLocked)}
                    </span>
                  </div>
                </span>
              {/if}
            {/snippet}
          </AnnotationLayer>
        </PagePointerProvider>
      </Rotate>
    {/snippet}
    <Viewport {documentId} class="absolute inset-0 bg-gray-200 dark:bg-gray-800">
      <Scroller {documentId} {renderPage} />
    </Viewport>
  </div>
</div>
