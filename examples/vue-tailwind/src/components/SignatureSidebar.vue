<script setup lang="ts">
import { computed } from 'vue';
import { useTranslations } from '@embedpdf/plugin-i18n/vue';
import {
  useSignatureEntries,
  useActivePlacement,
  useSignatureCapability,
  SignatureFieldKind,
  SignatureMode,
} from '@embedpdf/plugin-signature/vue';
import type { UIPlugin } from '@embedpdf/plugin-ui';
import { useCapability } from '@embedpdf/core/vue';
import { TrashIcon, SignatureIcon } from './icons';

const props = defineProps<{
  documentId: string;
}>();

const { translate } = useTranslations(() => props.documentId);
const { provides: signatureCapability } = useSignatureCapability();
const { entries } = useSignatureEntries();
const activePlacement = useActivePlacement(() => props.documentId);
const { provides: uiCapability } = useCapability<UIPlugin>('ui');

const mode = computed(() => signatureCapability.value?.mode ?? SignatureMode.SignatureOnly);
const showInitials = computed(() => mode.value === SignatureMode.SignatureAndInitials);

function handleCreate() {
  if (!uiCapability.value) return;
  uiCapability.value.forDocument(props.documentId).openModal('signature-create-modal');
}

function handlePlaceSignature(entryId: string) {
  if (!signatureCapability.value) return;
  signatureCapability.value.forDocument(props.documentId).activateSignaturePlacement(entryId);
}

function handlePlaceInitials(entryId: string) {
  if (!signatureCapability.value) return;
  signatureCapability.value.forDocument(props.documentId).activateInitialsPlacement(entryId);
}

function handleRemove(e: Event, entryId: string) {
  e.stopPropagation();
  if (!signatureCapability.value) return;
  signatureCapability.value.removeEntry(entryId);
}

function isActive(entryId: string, kind: SignatureFieldKind): boolean {
  const ap = activePlacement.value;
  return ap?.entryId === entryId && ap?.kind === kind;
}
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="border-b border-gray-200 p-3">
      <h2 class="text-md font-semibold text-gray-900">
        {{ translate('signature.title', { fallback: 'Signatures' }) }}
      </h2>
      <button
        class="mt-3 w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        @click="handleCreate"
      >
        {{
          translate(showInitials ? 'signature.createNewWithInitials' : 'signature.createNew', {
            fallback: showInitials ? 'Create Signature & Initials' : 'Create New Signature',
          })
        }}
      </button>
    </div>

    <div v-if="entries.length > 0" class="flex-1 overflow-y-auto p-4">
      <div class="flex flex-col gap-4">
        <div
          v-for="entry in entries"
          :key="entry.id"
          class="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-3 shadow-sm transition-all hover:border-gray-300 hover:shadow-md"
        >
          <div class="flex items-start justify-between">
            <div class="flex flex-1 items-center gap-2 pl-0.5 pt-0.5">
              <span class="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                {{ translate('signature.placeSignature', { fallback: 'Signature' }) }}
              </span>
              <template v-if="showInitials && entry.initials">
                <span class="text-[10px] text-gray-300">&bull;</span>
                <span class="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                  {{ translate('signature.placeInitials', { fallback: 'Initials' }) }}
                </span>
              </template>
            </div>

            <button
              class="-mr-1 -mt-1 flex rounded p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
              @click="handleRemove($event, entry.id)"
              :title="translate('signature.remove', { fallback: 'Remove signature' })"
            >
              <TrashIcon class="h-3.5 w-3.5" />
            </button>
          </div>

          <div class="flex gap-3">
            <!-- Signature field -->
            <div
              class="flex h-16 cursor-pointer items-center justify-center rounded-md border border-dashed transition-all"
              :class="[
                showInitials && entry.initials ? 'flex-[2]' : 'flex-1',
                isActive(entry.id, SignatureFieldKind.Signature)
                  ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500 ring-offset-1'
                  : 'border-gray-200 hover:border-gray-400 hover:bg-gray-50',
              ]"
              @click="handlePlaceSignature(entry.id)"
            >
              <img
                :src="entry.signature.previewDataUrl"
                class="h-12 max-w-[90%] object-contain"
                alt="Signature"
              />
            </div>

            <!-- Initials field -->
            <div
              v-if="showInitials && entry.initials"
              class="flex h-16 flex-1 cursor-pointer items-center justify-center rounded-md border border-dashed transition-all"
              :class="
                isActive(entry.id, SignatureFieldKind.Initials)
                  ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500 ring-offset-1'
                  : 'border-gray-200 hover:border-gray-400 hover:bg-gray-50'
              "
              @click="handlePlaceInitials(entry.id)"
            >
              <img
                :src="entry.initials.previewDataUrl"
                class="h-10 max-w-[80%] object-contain"
                alt="Initials"
              />
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="mt-8 flex flex-col items-center gap-2 p-4 text-gray-400">
      <SignatureIcon class="h-18 w-18 opacity-50" />
      <div class="max-w-[180px] text-center text-sm">
        {{
          translate('signature.emptyState', {
            fallback: 'No signatures yet. Create one to get started.',
          })
        }}
      </div>
    </div>
  </div>
</template>
