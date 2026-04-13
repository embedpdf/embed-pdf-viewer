<script setup lang="ts">
import { ref, watch } from 'vue';
import { useTranslations } from '@embedpdf/plugin-i18n/vue';
import {
  useStampLibraries,
  useStampsByLibrary,
  useStampCapability,
  useActiveStamp,
  StampImg,
} from '@embedpdf/plugin-stamp/vue';
import type { StampDefinition } from '@embedpdf/plugin-stamp/vue';
import { ignore } from '@embedpdf/models';
import { DownloadIcon, CloseIcon, RubberStampIcon } from './icons';

const STAMP_THUMB_WIDTH = 120;

const props = defineProps<{
  documentId: string;
  selectedLibraryId?: string;
}>();

const { translate } = useTranslations(() => props.documentId);
const { provides: stampCapability } = useStampCapability();
const { libraries } = useStampLibraries();
const selectedLibraryId = ref<string>('all');
const stamps = useStampsByLibrary(
  () => selectedLibraryId.value,
  () => 'sidebar',
);
const activeStamp = useActiveStamp(() => props.documentId);

watch(
  () => props.selectedLibraryId,
  (newVal) => {
    if (newVal) {
      selectedLibraryId.value = newVal;
    }
  },
);

const handleStampClick = (libraryId: string, stamp: StampDefinition) => {
  if (!stampCapability.value) return;
  stampCapability.value.forDocument(props.documentId).activateStampPlacement(libraryId, stamp);
};

const handleRemoveStamp = (e: Event, libraryId: string, stampId: string) => {
  e.stopPropagation();
  if (!stampCapability.value) return;
  stampCapability.value.removeStampFromLibrary(libraryId, stampId).wait(() => {}, ignore);
};

const handleExport = () => {
  if (!stampCapability.value) return;
  const libraryIds = [...new Set(stamps.value.map((s) => s.library.id))];
  for (const id of libraryIds) {
    stampCapability.value.exportLibrary(id).wait((exported) => {
      const blob = new Blob([exported.pdf], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${exported.name}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    }, ignore);
  }
};

const resolveLibraryName = (lib: { name: string; nameKey?: string }) =>
  translate(lib.nameKey ?? '', { fallback: lib.name });
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="border-b border-gray-200 p-4">
      <div class="flex items-center justify-between">
        <h2 class="text-md font-medium text-gray-900">
          {{ translate('stamp.title', { fallback: 'Rubber Stamps' }) }}
        </h2>
        <button
          v-if="stamps.length > 0"
          class="rounded p-1 text-gray-400 transition-colors hover:text-gray-600"
          @click="handleExport"
          :title="translate('insert.rubberStamp.export', { fallback: 'Export Stamps' })"
        >
          <DownloadIcon class="h-4 w-4" />
        </button>
      </div>

      <select
        v-if="libraries.length > 1"
        class="mt-4 w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        :value="selectedLibraryId"
        @change="selectedLibraryId = ($event.target as HTMLSelectElement).value"
      >
        <option value="all">
          {{ translate('stamp.allStamps', { fallback: 'All Stamps' }) }}
        </option>
        <option v-for="lib in libraries" :key="lib.id" :value="lib.id">
          {{ resolveLibraryName(lib) }}
        </option>
      </select>
    </div>

    <div v-if="stamps.length > 0" class="flex-1 overflow-y-auto p-4">
      <div class="grid grid-cols-2 gap-3">
        <div
          v-for="{ library, stamp } in stamps"
          :key="`${library.id}-${stamp.id}`"
          class="group relative flex cursor-pointer items-center justify-center overflow-hidden rounded-md border transition-colors"
          :class="
            activeStamp?.libraryId === library.id && activeStamp?.stamp.id === stamp.id
              ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500'
              : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
          "
          :style="{ aspectRatio: '1' }"
          @click="handleStampClick(library.id, stamp)"
        >
          <StampImg
            :libraryId="library.id"
            :pageIndex="stamp.pageIndex"
            :width="STAMP_THUMB_WIDTH"
            :style="{ maxWidth: '80%', maxHeight: '80%', objectFit: 'contain' }"
          />
          <button
            v-if="!library.readonly"
            class="absolute right-1 top-1 flex rounded-full border border-gray-200 bg-white p-0.5 text-gray-400 opacity-0 shadow-sm transition-opacity hover:text-gray-600 group-hover:opacity-100"
            @click.stop="handleRemoveStamp($event, library.id, stamp.id)"
          >
            <CloseIcon class="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>

    <div v-else class="mt-8 flex flex-col items-center gap-2 p-4 text-gray-400">
      <RubberStampIcon class="h-18 w-18 text-gray-400" />
      <div class="max-w-[150px] text-center text-sm text-gray-400">
        {{
          translate('stamp.emptyState', { fallback: 'No stamps found in the selected library.' })
        }}
      </div>
    </div>
  </div>
</template>
