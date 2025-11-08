<script lang="ts">
  import { usePrintCapability } from '@embedpdf/plugin-print/svelte';
  import { useScroll } from '@embedpdf/plugin-scroll/svelte';
  import type { PdfPrintOptions } from '@embedpdf/models';

  interface Props {
    open: boolean;
    onClose: () => void;
  }

  const { open, onClose }: Props = $props();

  const printCapability = usePrintCapability();
  const scroll = useScroll();

  type PageSelection = 'all' | 'current' | 'custom';
  let selection = $state<PageSelection>('all');
  let customPages = $state('');
  let includeAnnotations = $state(true);
  let isLoading = $state(false);

  const canSubmit = $derived(
    !isLoading && (selection !== 'custom' || customPages.trim().length > 0),
  );

  const handleClose = () => {
    onClose();
    // Reset form when closing
    selection = 'all';
    customPages = '';
    includeAnnotations = true;
    isLoading = false;
  };

  const handlePrint = async () => {
    if (!printCapability || !canSubmit) return;

    isLoading = true;

    let pageRange: string | undefined;

    if (selection === 'current') {
      pageRange = String(scroll.state.currentPage);
    } else if (selection === 'custom') {
      pageRange = customPages.trim() || undefined;
    }

    const options: PdfPrintOptions = {
      includeAnnotations,
      pageRange,
    };

    try {
      const task = printCapability.provides?.print(options);

      if (task) {
        task.wait(
          () => {
            handleClose();
          },
          (error) => {
            console.error('Print failed:', error);
            isLoading = false;
          },
        );
      }
    } catch (err) {
      console.error('Print failed:', err);
      isLoading = false;
    }
  };

  const handleBackdropClick = (e: MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };
</script>

{#if open}
  <!-- Backdrop -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    onclick={handleBackdropClick}
    role="presentation"
  >
    <!-- Dialog -->
    <div
      class="w-full max-w-md rounded-lg bg-white shadow-xl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="print-dialog-title"
    >
      <!-- Header -->
      <div class="border-b border-gray-200 px-6 py-4">
        <h2 id="print-dialog-title" class="text-lg font-semibold text-gray-900">Print Settings</h2>
      </div>

      <!-- Content -->
      <div class="space-y-6 px-6 py-4">
        <!-- Pages to print -->
        <div>
          <div class="mb-2 block text-sm font-medium text-gray-700">Pages to print</div>
          <div class="space-y-2">
            <label class="flex items-center gap-2">
              <input
                type="radio"
                name="pageSelection"
                value="all"
                checked={selection === 'all'}
                onchange={() => (selection = 'all')}
                class="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span class="text-sm text-gray-700">All pages</span>
            </label>
            <label class="flex items-center gap-2">
              <input
                type="radio"
                name="pageSelection"
                value="current"
                checked={selection === 'current'}
                onchange={() => (selection = 'current')}
                class="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span class="text-sm text-gray-700">Current page ({scroll.state.currentPage})</span>
            </label>
            <label class="flex items-center gap-2">
              <input
                type="radio"
                name="pageSelection"
                value="custom"
                checked={selection === 'custom'}
                onchange={() => (selection = 'custom')}
                class="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span class="text-sm text-gray-700">Specify pages</span>
            </label>
          </div>

          <!-- Custom page range input -->
          <div class="mt-2">
            <input
              type="text"
              bind:value={customPages}
              placeholder="e.g., 1-3, 5, 8-10"
              disabled={selection !== 'custom'}
              class="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
            />
            {#if customPages.trim() && scroll.state.totalPages > 0}
              <p class="mt-1 text-xs text-gray-500">
                Total pages in document: {scroll.state.totalPages}
              </p>
            {/if}
          </div>
        </div>

        <!-- Include annotations -->
        <div>
          <label class="flex items-center gap-2">
            <input
              type="checkbox"
              bind:checked={includeAnnotations}
              class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span class="text-sm text-gray-700">Include annotations</span>
          </label>
        </div>
      </div>

      <!-- Footer -->
      <div class="flex justify-end gap-2 border-t border-gray-200 px-6 py-4">
        <button
          onclick={handleClose}
          disabled={isLoading}
          class="rounded px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onclick={handlePrint}
          disabled={!canSubmit}
          class="flex items-center gap-2 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400"
        >
          {#if isLoading}
            <svg
              class="h-4 w-4 animate-spin"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                class="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                stroke-width="4"
              ></circle>
              <path
                class="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
          {/if}
          <span>Print</span>
        </button>
      </div>
    </div>
  </div>
{/if}
