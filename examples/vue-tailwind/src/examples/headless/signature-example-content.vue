<script setup lang="ts">
import { ref } from 'vue';
import { Viewport } from '@embedpdf/plugin-viewport/vue';
import { Scroller } from '@embedpdf/plugin-scroll/vue';
import { RenderLayer } from '@embedpdf/plugin-render/vue';
import { PagePointerProvider } from '@embedpdf/plugin-interaction-manager/vue';
import { SelectionLayer } from '@embedpdf/plugin-selection/vue';
import { AnnotationLayer } from '@embedpdf/plugin-annotation/vue';
import {
  SignatureDrawPad,
  SignatureTypePad,
  useSignatureEntries,
  useActivePlacement,
  useSignatureCapability,
  useSignatureUpload,
  type SignatureFieldDefinition,
} from '@embedpdf/plugin-signature/vue';
import { PenTool, Type, Upload as UploadIcon, Trash2, X } from 'lucide-vue-next';

const props = defineProps<{
  documentId: string;
}>();

const { entries } = useSignatureEntries();
const { provides: signatureCapability } = useSignatureCapability();
const activePlacement = useActivePlacement(() => props.documentId);

const creationMode = ref<'draw' | 'type' | null>(null);
const tempSignature = ref<SignatureFieldDefinition | null>(null);

const { openFilePicker, inputRef, handleFileInputChange } = useSignatureUpload({
  onResult: (result) => {
    if (result && signatureCapability.value) {
      signatureCapability.value.addEntry({ signature: result });
    }
  },
});

const handleSaveTemp = () => {
  if (tempSignature.value && signatureCapability.value) {
    signatureCapability.value.addEntry({ signature: tempSignature.value });
    creationMode.value = null;
    tempSignature.value = null;
  }
};

const handleDelete = (e: Event, id: string) => {
  e.stopPropagation();
  signatureCapability.value?.removeEntry(id);
};

const togglePlacement = (id: string) => {
  const scope = signatureCapability.value?.forDocument(props.documentId);
  if (activePlacement.value?.entryId === id) {
    scope?.deactivatePlacement();
  } else {
    scope?.activateSignaturePlacement(id);
  }
};
</script>

<template>
  <div
    class="flex h-[500px] overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900"
    style="user-select: none"
  >
    <aside
      class="flex h-full w-full shrink-0 flex-col border-r border-gray-300 bg-gray-50 lg:w-[300px] dark:border-gray-700 dark:bg-gray-900"
    >
      <div class="border-b border-gray-200 p-4 dark:border-gray-800">
        <h2 class="text-sm font-semibold text-gray-900 dark:text-gray-100">My Signatures</h2>
        <p class="mt-1 text-xs text-gray-500">
          Create a signature and click it to place on the document.
        </p>

        <div class="mt-4 flex gap-2">
          <button
            @click="creationMode = 'draw'"
            class="flex flex-1 items-center justify-center gap-1.5 rounded bg-white px-2 py-1.5 text-xs font-medium text-gray-700 shadow-sm ring-1 ring-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-200 dark:ring-gray-600"
          >
            <PenTool :size="14" /> Draw
          </button>
          <button
            @click="creationMode = 'type'"
            class="flex flex-1 items-center justify-center gap-1.5 rounded bg-white px-2 py-1.5 text-xs font-medium text-gray-700 shadow-sm ring-1 ring-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-200 dark:ring-gray-600"
          >
            <Type :size="14" /> Type
          </button>
          <button
            @click="openFilePicker"
            class="flex flex-1 items-center justify-center gap-1.5 rounded bg-white px-2 py-1.5 text-xs font-medium text-gray-700 shadow-sm ring-1 ring-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-200 dark:ring-gray-600"
          >
            <UploadIcon :size="14" /> Image
          </button>
          <input
            type="file"
            ref="inputRef"
            @change="handleFileInputChange"
            class="hidden"
            accept="image/*"
          />
        </div>
      </div>

      <div
        v-if="creationMode"
        class="border-b border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950"
      >
        <div class="mb-2 flex items-center justify-between">
          <span class="text-xs font-medium uppercase text-gray-500">New Signature</span>
          <button @click="creationMode = null">
            <X :size="14" class="text-gray-400 hover:text-gray-600" />
          </button>
        </div>

        <div
          class="relative h-[120px] w-full rounded-md border-2 border-dashed border-gray-300 bg-gray-50 dark:border-gray-700 dark:bg-gray-900"
        >
          <SignatureDrawPad
            v-if="creationMode === 'draw'"
            @result="(res) => (tempSignature = res)"
            strokeColor="blue"
          />
          <SignatureTypePad
            v-if="creationMode === 'type'"
            @result="(res) => (tempSignature = res)"
            color="blue"
          />
        </div>

        <button
          :disabled="!tempSignature"
          @click="handleSaveTemp"
          class="mt-3 w-full rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Save Signature
        </button>
      </div>

      <div class="flex-1 space-y-3 overflow-y-auto p-4">
        <div
          v-for="entry in entries"
          :key="entry.id"
          @click="togglePlacement(entry.id)"
          :class="[
            'relative cursor-pointer rounded-lg border p-2 transition-all',
            activePlacement?.entryId === entry.id
              ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500 dark:border-blue-400 dark:bg-blue-900/20'
              : 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800',
          ]"
        >
          <img
            :src="entry.signature.previewDataUrl"
            alt="Signature preview"
            class="h-[60px] w-full object-contain"
          />
          <button
            @click="handleDelete($event, entry.id)"
            class="absolute right-1 top-1 p-1 text-gray-400 hover:text-red-500"
          >
            <Trash2 :size="14" />
          </button>
        </div>
        <div
          v-if="entries.length === 0 && !creationMode"
          class="py-8 text-center text-sm text-gray-400"
        >
          No signatures yet.
        </div>
      </div>
    </aside>

    <div class="relative flex-1">
      <Viewport :document-id="documentId" class="absolute inset-0 bg-gray-200 dark:bg-gray-800">
        <Scroller :document-id="documentId">
          <template #default="{ page }">
            <PagePointerProvider :document-id="documentId" :page-index="page.pageIndex">
              <RenderLayer
                :document-id="documentId"
                :page-index="page.pageIndex"
                style="pointer-events: none"
              />
              <SelectionLayer :document-id="documentId" :page-index="page.pageIndex" />
              <AnnotationLayer :document-id="documentId" :page-index="page.pageIndex" />
            </PagePointerProvider>
          </template>
        </Scroller>
      </Viewport>
    </div>
  </div>
</template>
