<template>
  <Dialog :open="isOpen" :onClose="handleClose" title="Print Settings" maxWidth="28rem">
    <DialogContent>
      <!-- Pages to print -->
      <div>
        <label class="mb-3 block text-sm font-medium text-gray-700">Pages to print</label>
        <div class="space-y-2">
          <label class="flex items-center">
            <input
              type="radio"
              name="selection"
              value="all"
              :checked="selection === 'all'"
              @change="selection = 'all'"
              class="h-4 w-4 border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
            />
            <span class="ml-2 text-sm text-gray-700">All pages</span>
          </label>

          <label class="flex items-center">
            <input
              type="radio"
              name="selection"
              value="current"
              :checked="selection === 'current'"
              @change="selection = 'current'"
              class="h-4 w-4 border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
            />
            <span class="ml-2 text-sm text-gray-700"> Current page ({{ state.currentPage }}) </span>
          </label>

          <label class="flex items-center">
            <input
              type="radio"
              name="selection"
              value="custom"
              :checked="selection === 'custom'"
              @change="selection = 'custom'"
              class="h-4 w-4 border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
            />
            <span class="ml-2 text-sm text-gray-700">Specify pages</span>
          </label>
        </div>

        <!-- Custom page range input -->
        <div class="mt-3">
          <input
            type="text"
            v-model="customPages"
            placeholder="e.g., 1-3, 5, 8-10"
            :disabled="selection !== 'custom'"
            class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
          />
          <p v-if="customPages.trim() && state.totalPages > 0" class="mt-1 text-xs text-gray-500">
            Total pages in document: {{ state.totalPages }}
          </p>
        </div>
      </div>

      <!-- Include annotations -->
      <div>
        <label class="flex items-center">
          <input
            type="checkbox"
            v-model="includeAnnotations"
            class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
          />
          <span class="ml-2 text-sm text-gray-700">Include annotations</span>
        </label>
      </div>
    </DialogContent>
    <DialogFooter>
      <Button variant="secondary" :onClick="handleClose" :disabled="isLoading"> Cancel </Button>
      <Button variant="primary" :onClick="handlePrint" :disabled="!canSubmit">
        {{ isLoading ? 'Printing...' : 'Print' }}
      </Button>
    </DialogFooter>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { usePrintCapability } from '@embedpdf/plugin-print/vue';
import { useScroll } from '@embedpdf/plugin-scroll/vue';
import type { PdfPrintOptions } from '@embedpdf/models';
import { Dialog, DialogContent, DialogFooter, Button } from './ui';

type PageSelection = 'all' | 'current' | 'custom';

const props = defineProps<{
  documentId: string;
  isOpen: boolean;
  onClose: () => void;
}>();

const { provides: printCapability } = usePrintCapability();
const { state } = useScroll(() => props.documentId);

// Dialog state
const selection = ref<PageSelection>('all');
const customPages = ref('');
const includeAnnotations = ref(true);
const isLoading = ref(false);

const canSubmit = computed(() => {
  if (isLoading.value) return false;
  return selection.value !== 'custom' || customPages.value.trim().length > 0;
});

// Reset form when dialog opens/closes
watch(
  () => props.isOpen,
  (isOpen) => {
    if (!isOpen) {
      selection.value = 'all';
      customPages.value = '';
      includeAnnotations.value = true;
      isLoading.value = false;
    }
  },
);

const handleClose = () => {
  props.onClose();
};

const handlePrint = async () => {
  if (!printCapability.value || !canSubmit.value) return;

  isLoading.value = true;

  let pageRange: string | undefined;

  if (selection.value === 'current') {
    pageRange = String(state.value.currentPage);
  } else if (selection.value === 'custom') {
    pageRange = customPages.value.trim() || undefined;
  }

  const options: PdfPrintOptions = {
    includeAnnotations: includeAnnotations.value,
    pageRange,
  };

  try {
    const task = printCapability.value.print(options);

    if (task) {
      task.wait(
        () => {
          handleClose();
        },
        (error) => {
          console.error('Print failed:', error);
          isLoading.value = false;
        },
      );
    }
  } catch (err) {
    console.error('Print failed:', err);
    isLoading.value = false;
  }
};
</script>
