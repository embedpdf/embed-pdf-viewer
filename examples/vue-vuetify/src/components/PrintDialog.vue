<script setup lang="ts">
import { ref, computed } from 'vue';
import { usePrintCapability } from '@embedpdf/plugin-print/vue';
import { useScroll } from '@embedpdf/plugin-scroll/vue';
import type { PdfPrintOptions } from '@embedpdf/models';

interface Props {
  open: boolean;
  documentId: string;
}

interface Emits {
  (e: 'close'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const { provides: printCapability } = usePrintCapability();
const { state } = useScroll(() => props.documentId);

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
  <v-dialog
    :model-value="open"
    @update:model-value="!$event && handleClose()"
    max-width="500px"
    persistent
  >
    <v-card title="Print Settings">
      <v-card-text>
        <div class="space-y-6">
          <!-- Pages to print -->
          <div>
            <v-label class="text-subtitle-2 font-weight-medium mb-2">Pages to print</v-label>
            <v-radio-group v-model="selection" density="comfortable">
              <v-radio label="All pages" value="all" />
              <v-radio :label="`Current page (${state.currentPage})`" value="current" />
              <v-radio label="Specify pages" value="custom" />
            </v-radio-group>

            <!-- Custom page range input -->
            <div>
              <v-text-field
                v-model="customPages"
                placeholder="e.g., 1-3, 5, 8-10"
                variant="outlined"
                density="compact"
                hide-details="auto"
                :disabled="selection !== 'custom'"
              />
              <div
                v-if="customPages.trim() && state.totalPages > 0"
                class="text-caption text-medium-emphasis mt-1"
              >
                Total pages in document: {{ state.totalPages }}
              </div>
            </div>
          </div>

          <!-- Include annotations -->
          <div>
            <v-checkbox
              v-model="includeAnnotations"
              label="Include annotations"
              density="compact"
              hide-details
            />
          </div>
        </div>
      </v-card-text>

      <v-card-actions class="px-6 pb-4">
        <v-spacer />
        <v-btn @click="handleClose" variant="text" :disabled="isLoading"> Cancel </v-btn>
        <v-btn
          @click="handlePrint"
          color="primary"
          variant="elevated"
          :disabled="!canSubmit"
          :loading="isLoading"
        >
          Print
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.space-y-6 > * + * {
  margin-top: 1.5rem;
}
</style>
