<script setup lang="ts">
import { ref, computed } from 'vue';
import { usePrintCapability } from '@embedpdf/plugin-print/vue';
import { useScroll } from '@embedpdf/plugin-scroll/vue';
import type { PdfPrintOptions } from '@embedpdf/models';

interface Props {
  open: boolean;
}

interface Emits {
  (e: 'close'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const { provides: printCapability } = usePrintCapability();
const { state } = useScroll();

// Dialog state
type PageSelection = 'all' | 'current' | 'custom';
const selection = ref<PageSelection>('all');
const customPages = ref('');
const includeAnnotations = ref(true);
const isLoading = ref(false);

const canSubmit = computed(() => {
  if (isLoading.value) return false;
  return selection.value !== 'custom' || customPages.value.trim().length > 0;
});

const pageOptions = computed(() => [
  { label: 'All pages', value: 'all' as PageSelection },
  { label: `Current page (${state.value.currentPage})`, value: 'current' as PageSelection },
  { label: 'Specify pages', value: 'custom' as PageSelection },
]);

const dialogModel = computed({
  get: () => props.open,
  set: (value: boolean) => {
    if (!value) {
      handleClose();
    }
  },
});

const handleClose = () => {
  emit('close');
  // Reset form when closing
  selection.value = 'all';
  customPages.value = '';
  includeAnnotations.value = true;
  isLoading.value = false;
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
<template>
  <q-dialog v-model="dialogModel" persistent>
    <q-card style="max-width: 500px; width: 100%;">
      <q-card-section class="text-h6">Print Settings</q-card-section>
      <q-separator />
      <q-card-section class="column q-gutter-lg">
        <!-- Pages to print -->
        <div class="column q-gutter-sm">
          <div class="text-subtitle2 text-weight-medium">Pages to print</div>
          <q-option-group
            v-model="selection"
            :options="pageOptions"
            type="radio"
            dense
          />
          <q-input
            v-model="customPages"
            placeholder="e.g., 1-3, 5, 8-10"
            outlined
            dense
            :disable="selection !== 'custom'"
            hint="Use commas to separate individual pages or ranges."
            hide-bottom-space
          />
          <div v-if="customPages.trim() && state.totalPages > 0" class="text-caption text-grey-7">
            Total pages in document: {{ state.totalPages }}
          </div>
        </div>

        <!-- Include annotations -->
        <q-checkbox v-model="includeAnnotations" label="Include annotations" dense />
      </q-card-section>
      <q-separator />
      <q-card-actions align="right">
        <q-btn flat label="Cancel" :disable="isLoading" @click="handleClose" />
        <q-btn
          unelevated
          color="primary"
          label="Print"
          :disable="!canSubmit"
          :loading="isLoading"
          @click="handlePrint"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>
