<script lang="ts">
  import { usePrint } from '@embedpdf/plugin-print/svelte';
  import { useScroll } from '@embedpdf/plugin-scroll/svelte';
  import type { PdfPrintOptions } from '@embedpdf/models';
  import { Dialog, DialogContent, DialogFooter, Button } from './ui';

  type PageSelection = 'all' | 'current' | 'custom';

  interface PrintDialogProps {
    documentId: string;
    isOpen: boolean;
    onClose: () => void;
  }

  let { documentId, isOpen, onClose }: PrintDialogProps = $props();

  const printPlugin = usePrint(() => documentId);
  const scrollPlugin = useScroll(() => documentId);

  let selection = $state<PageSelection>('all');
  let customPages = $state('');
  let includeAnnotations = $state(true);
  let isLoading = $state(false);

  // Reset form when dialog opens/closes
  $effect(() => {
    if (!isOpen) {
      selection = 'all';
      customPages = '';
      includeAnnotations = true;
      isLoading = false;
    }
  });

  const canSubmit = $derived(
    !isLoading && (selection !== 'custom' || customPages.trim().length > 0),
  );

  const handlePrint = async () => {
    if (!printPlugin.provides || !canSubmit) return;

    isLoading = true;

    let pageRange: string | undefined;

    if (selection === 'current') {
      pageRange = String(scrollPlugin.state.currentPage);
    } else if (selection === 'custom') {
      pageRange = customPages.trim() || undefined;
    }

    const options: PdfPrintOptions = {
      includeAnnotations,
      pageRange,
    };

    try {
      const task = printPlugin.provides.print(options);

      if (task) {
        task.wait(
          () => {
            onClose();
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
</script>

{#if isOpen}
  <Dialog open={isOpen} {onClose} title="Print Settings" maxWidth="28rem">
    <DialogContent>
      <!-- Pages to print -->
      <div>
        <div class="mb-3 block text-sm font-medium text-gray-700">Pages to print</div>
        <div class="space-y-2">
          <label class="flex items-center">
            <input
              type="radio"
              name="selection"
              value="all"
              checked={selection === 'all'}
              onchange={() => (selection = 'all')}
              class="h-4 w-4 border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
            />
            <span class="ml-2 text-sm text-gray-700">All pages</span>
          </label>

          <label class="flex items-center">
            <input
              type="radio"
              name="selection"
              value="current"
              checked={selection === 'current'}
              onchange={() => (selection = 'current')}
              class="h-4 w-4 border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
            />
            <span class="ml-2 text-sm text-gray-700">
              Current page ({scrollPlugin.state.currentPage})
            </span>
          </label>

          <label class="flex items-center">
            <input
              type="radio"
              name="selection"
              value="custom"
              checked={selection === 'custom'}
              onchange={() => (selection = 'custom')}
              class="h-4 w-4 border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
            />
            <span class="ml-2 text-sm text-gray-700">Specify pages</span>
          </label>
        </div>

        <!-- Custom page range input -->
        <div class="mt-3">
          <input
            type="text"
            bind:value={customPages}
            placeholder="e.g., 1-3, 5, 8-10"
            disabled={selection !== 'custom'}
            class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
          />
          {#if customPages.trim() && scrollPlugin.state.totalPages > 0}
            <p class="mt-1 text-xs text-gray-500">
              Total pages in document: {scrollPlugin.state.totalPages}
            </p>
          {/if}
        </div>
      </div>

      <!-- Include annotations -->
      <div>
        <label class="flex items-center">
          <input
            type="checkbox"
            bind:checked={includeAnnotations}
            class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
          />
          <span class="ml-2 text-sm text-gray-700">Include annotations</span>
        </label>
      </div>
    </DialogContent>
    <DialogFooter>
      <Button variant="secondary" onclick={onClose} disabled={isLoading}>Cancel</Button>
      <Button variant="primary" onclick={handlePrint} disabled={!canSubmit}>
        {isLoading ? 'Printing...' : 'Print'}
      </Button>
    </DialogFooter>
  </Dialog>
{/if}
