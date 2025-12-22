<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Viewport } from '@embedpdf/plugin-viewport/svelte';
  import { Scroller, type RenderPageProps } from '@embedpdf/plugin-scroll/svelte';
  import { RenderLayer } from '@embedpdf/plugin-render/svelte';
  import {
    SelectionLayer,
    useSelectionCapability,
    type SelectionRangeX,
  } from '@embedpdf/plugin-selection/svelte';
  import { PagePointerProvider } from '@embedpdf/plugin-interaction-manager/svelte';
  import { ignore } from '@embedpdf/models';
  import { Copy, Type, Check } from 'lucide-svelte';

  interface Props {
    documentId: string;
  }

  let { documentId }: Props = $props();

  const selectionCapability = useSelectionCapability();
  const selection = $derived(selectionCapability.provides?.forDocument(documentId));
  let hasSelection = $state(false);
  let selectedText = $state('');
  let copied = $state(false);
  let menuCopied = $state(false);

  let unsubscribeSelectionChange: (() => void) | undefined;
  let unsubscribeEndSelection: (() => void) | undefined;

  onMount(() => {
    if (!selection) return;

    unsubscribeSelectionChange = selection.onSelectionChange(
      (selectionRange: SelectionRangeX | null) => {
        hasSelection = !!selectionRange;
        if (!selectionRange) {
          selectedText = '';
        }
      },
    );

    unsubscribeEndSelection = selection.onEndSelection(() => {
      const textTask = selection!.getSelectedText();
      textTask.wait((textLines) => {
        selectedText = textLines.join('\n');
      }, ignore);
    });
  });

  onDestroy(() => {
    unsubscribeSelectionChange?.();
    unsubscribeEndSelection?.();
  });

  const handleCopy = () => {
    selection?.copyToClipboard();
    copied = true;
    setTimeout(() => {
      copied = false;
    }, 2000);
  };

  const handleCopyFromMenu = () => {
    selection?.copyToClipboard();
    selection?.clear();
    menuCopied = true;
    setTimeout(() => {
      menuCopied = false;
    }, 1500);
  };
</script>

<div
  class="overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900"
  style="user-select: none"
>
  <!-- Toolbar -->
  <div
    class="flex items-center gap-3 border-b border-gray-300 bg-gray-100 px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
  >
    <button
      onclick={handleCopy}
      disabled={!hasSelection}
      class={[
        'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium shadow-sm transition-all',
        hasSelection
          ? 'bg-blue-500 text-white ring-1 ring-blue-600 hover:bg-blue-600'
          : 'cursor-not-allowed bg-white text-gray-400 ring-1 ring-gray-300 dark:bg-gray-700 dark:text-gray-500 dark:ring-gray-600',
      ].join(' ')}
      title="Copy Selected Text"
    >
      {#if copied}
        <Check size={14} class="text-white" />
      {:else}
        <Copy size={14} />
      {/if}
      {copied ? 'Copied!' : 'Copy Text'}
    </button>
    <span class="text-xs text-gray-600 dark:text-gray-300">
      {hasSelection ? 'Text selected — click to copy' : 'Click and drag to select text'}
    </span>
  </div>

  <!-- PDF Viewer Area -->
  <div class="relative h-[400px] sm:h-[500px]">
    {#snippet renderPage(page: RenderPageProps)}
      <PagePointerProvider {documentId} pageIndex={page.pageIndex}>
        <RenderLayer
          {documentId}
          pageIndex={page.pageIndex}
          scale={1}
          class="pointer-events-none"
        />
        <SelectionLayer {documentId} pageIndex={page.pageIndex}>
          {#snippet selectionMenuSnippet({ rect, menuWrapperProps, placement })}
            {@const menuStyle = placement?.suggestTop
              ? `position: absolute; pointer-events: auto; cursor: default; top: -48px; left: 0;`
              : `position: absolute; pointer-events: auto; cursor: default; top: ${rect.size.height + 8}px; left: 0;`}
            <span style={menuWrapperProps.style} use:menuWrapperProps.action>
              <div
                class="rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800"
                style={menuStyle}
              >
                <div class="flex items-center gap-1 px-2 py-1">
                  <button
                    onclick={handleCopyFromMenu}
                    class="flex items-center gap-1.5 rounded px-2 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                    aria-label="Copy selected text"
                    title="Copy"
                  >
                    {#if menuCopied}
                      <Check size={16} class="text-green-600 dark:text-green-400" />
                      <span class="text-green-600 dark:text-green-400">Copied!</span>
                    {:else}
                      <Copy size={16} />
                      <span>Copy</span>
                    {/if}
                  </button>
                </div>
              </div>
            </span>
          {/snippet}
        </SelectionLayer>
      </PagePointerProvider>
    {/snippet}
    <Viewport {documentId} class="absolute inset-0 bg-gray-200 dark:bg-gray-800">
      <Scroller {documentId} {renderPage} />
    </Viewport>
  </div>

  <!-- Selected Text Panel -->
  <div class="border-t border-gray-300 bg-gray-100 p-4 dark:border-gray-700 dark:bg-gray-800">
    <div class="mb-2 flex items-center gap-2">
      <Type size={14} class="text-gray-500 dark:text-gray-400" />
      <span class="text-xs font-medium uppercase tracking-wide text-gray-600 dark:text-gray-300">
        Selected Text
      </span>
    </div>
    {#if hasSelection}
      <div
        class="mt-2 rounded-md border border-gray-300 bg-white p-3 dark:border-gray-600 dark:bg-gray-900"
      >
        <p class="m-0 whitespace-pre-line break-words text-sm text-gray-800 dark:text-gray-200">
          {selectedText || 'Loading...'}
        </p>
      </div>
    {:else}
      <div class="mt-2 flex flex-col items-center justify-center py-6 text-center">
        <div
          class="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-gray-300 dark:bg-gray-700 dark:ring-gray-600"
        >
          <Type size={20} class="text-gray-400 dark:text-gray-500" />
        </div>
        <p class="text-sm text-gray-600 dark:text-gray-300">
          Select text in the PDF to see it here
        </p>
      </div>
    {/if}
  </div>
</div>
