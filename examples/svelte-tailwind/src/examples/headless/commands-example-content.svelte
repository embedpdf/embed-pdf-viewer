<script lang="ts">
  import { Viewport } from '@embedpdf/plugin-viewport/svelte';
  import { Scroller, useScroll, type RenderPageProps } from '@embedpdf/plugin-scroll/svelte';
  import { RenderLayer } from '@embedpdf/plugin-render/svelte';
  import { useCommand } from '@embedpdf/plugin-commands/svelte';
  import { Keyboard, ChevronLeft, ChevronRight, Info } from 'lucide-svelte';

  interface Props {
    documentId: string;
  }

  let { documentId }: Props = $props();

  const scroll = useScroll(() => documentId);

  // Commands
  const prevCommand = useCommand(
    () => 'nav.prev',
    () => documentId,
  );
  const nextCommand = useCommand(
    () => 'nav.next',
    () => documentId,
  );
  const alertCommand = useCommand(
    () => 'doc.alert',
    () => documentId,
  );

  // Format shortcut for display
  const formatShortcut = (shortcut: string) => {
    return shortcut
      .replace('arrowleft', '←')
      .replace('arrowright', '→')
      .replace('ctrl+', '⌃')
      .replace('meta+', '⌘')
      .toUpperCase();
  };
</script>

<!-- Toolbar -->
<div
  class="flex items-center gap-3 border-b border-gray-300 bg-gray-100 px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
>
  <div class="flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-300">
    <Keyboard size={14} />
    <span class="hidden uppercase tracking-wide sm:inline">Commands</span>
  </div>
  <div class="h-4 w-px bg-gray-300 dark:bg-gray-600"></div>

  <!-- Navigation -->
  <div class="flex items-center gap-1">
    <!-- Previous -->
    {#if prevCommand}
      <button
        type="button"
        onclick={prevCommand.current?.execute}
        disabled={prevCommand.current?.disabled}
        class="inline-flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 shadow-sm ring-1 ring-gray-300 transition-all hover:bg-gray-50 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100"
        title={prevCommand.current?.shortcuts
          ? `Shortcut: ${prevCommand.current?.shortcuts.join(', ')}`
          : undefined}
      >
        <ChevronLeft size={14} />
        {#if prevCommand.current?.shortcuts?.[0]}
          <kbd
            class="hidden items-center rounded border border-gray-300 bg-gray-200 px-1.5 py-0.5 font-mono text-[10px] font-medium text-gray-500 sm:inline-flex dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300"
          >
            {formatShortcut(prevCommand.current?.shortcuts[0])}
          </kbd>
        {/if}
      </button>
    {/if}

    <!-- Page indicator -->
    <div
      class="min-w-[80px] rounded-md bg-white px-2 py-1 text-center shadow-sm ring-1 ring-gray-300 dark:bg-gray-700 dark:ring-gray-600"
    >
      <span class="text-xs font-medium text-gray-700 dark:text-gray-300">
        {scroll.state?.currentPage}
        <span class="text-gray-500 dark:text-gray-400">/</span>
        {scroll.state?.totalPages}
      </span>
    </div>

    <!-- Next -->
    {#if nextCommand}
      <button
        type="button"
        onclick={nextCommand.current?.execute}
        disabled={nextCommand.current?.disabled}
        class="inline-flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 shadow-sm ring-1 ring-gray-300 transition-all hover:bg-gray-50 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100"
        title={nextCommand.current?.shortcuts
          ? `Shortcut: ${nextCommand.current?.shortcuts.join(', ')}`
          : undefined}
      >
        <ChevronRight size={14} />
        {#if nextCommand.current?.shortcuts?.[0]}
          <kbd
            class="hidden items-center rounded border border-gray-300 bg-gray-200 px-1.5 py-0.5 font-mono text-[10px] font-medium text-gray-500 sm:inline-flex dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300"
          >
            {formatShortcut(nextCommand.current?.shortcuts[0])}
          </kbd>
        {/if}
      </button>
    {/if}
  </div>

  <div class="flex-1"></div>

  <!-- Actions -->
  {#if alertCommand}
    <button
      type="button"
      onclick={alertCommand.current?.execute}
      disabled={alertCommand.current?.disabled}
      class="inline-flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 shadow-sm ring-1 ring-gray-300 transition-all hover:bg-gray-50 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100"
      title={alertCommand.current?.shortcuts
        ? `Shortcut: ${alertCommand.current?.shortcuts.join(', ')}`
        : undefined}
    >
      <Info size={14} />
      <span class="hidden sm:inline">{alertCommand.current?.label}</span>
      {#if alertCommand.current?.shortcuts?.[0]}
        <kbd
          class="hidden items-center rounded border border-gray-300 bg-gray-200 px-1.5 py-0.5 font-mono text-[10px] font-medium text-gray-500 sm:inline-flex dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300"
        >
          {formatShortcut(alertCommand.current?.shortcuts?.[0])}
        </kbd>
      {/if}
    </button>
  {/if}

  <!-- Hint -->
  <span class="hidden text-[10px] text-gray-600 lg:inline dark:text-gray-300">
    Use keyboard shortcuts to navigate
  </span>
</div>

<!-- PDF Viewer Area -->
<div class="relative h-[400px] sm:h-[500px]">
  {#snippet renderPage(page: RenderPageProps)}
    <RenderLayer {documentId} pageIndex={page.pageIndex} />
  {/snippet}
  <Viewport {documentId} class="absolute inset-0 bg-gray-200 dark:bg-gray-800">
    <Scroller {documentId} {renderPage} />
  </Viewport>
</div>
