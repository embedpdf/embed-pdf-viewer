<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useTranslations } from '@embedpdf/plugin-i18n/vue';
import {
  useSignatureCapability,
  useSignatureUpload,
  SignatureDrawPad,
  SignatureTypePad,
  SignatureMode,
} from '@embedpdf/plugin-signature/vue';
import type { SignatureFieldDefinition } from '@embedpdf/plugin-signature/vue';
import Dialog from './ui/Dialog.vue';

const SIGNATURE_FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Caveat&family=Dancing+Script&family=Great+Vibes&family=Pacifico&display=swap';

function ensureSignatureFonts() {
  if (document.querySelector(`link[href="${SIGNATURE_FONTS_URL}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = SIGNATURE_FONTS_URL;
  document.head.appendChild(link);
}

type CreationTab = 'draw' | 'type' | 'upload';

interface FieldResult {
  field: SignatureFieldDefinition;
}

const FONTS = [
  { name: 'Dancing Script', family: "'Dancing Script', cursive" },
  { name: 'Great Vibes', family: "'Great Vibes', cursive" },
  { name: 'Pacifico', family: "'Pacifico', cursive" },
  { name: 'Caveat', family: "'Caveat', cursive" },
];

const COLORS = [
  { name: 'Black', value: '#000000' },
  { name: 'Blue', value: '#597ce2' },
  { name: 'Red', value: '#e44234' },
];

const props = withDefaults(
  defineProps<{
    documentId: string;
    isOpen?: boolean;
    onClose?: () => void;
    onExited?: () => void;
  }>(),
  {
    isOpen: false,
  },
);

const { translate } = useTranslations(() => props.documentId);
const { provides: signatureCapability } = useSignatureCapability();

const mode = computed(() => signatureCapability.value?.mode ?? SignatureMode.SignatureOnly);
const needsInitials = computed(() => mode.value === SignatureMode.SignatureAndInitials);

const activeTab = ref<CreationTab>('draw');
const selectedFont = ref(FONTS[0].family);
const selectedColor = ref(COLORS[0].value);
const sigResult = ref<FieldResult | null>(null);
const iniResult = ref<FieldResult | null>(null);

const sigDrawRef = ref<InstanceType<typeof SignatureDrawPad> | null>(null);
const iniDrawRef = ref<InstanceType<typeof SignatureDrawPad> | null>(null);
const sigTypeRef = ref<InstanceType<typeof SignatureTypePad> | null>(null);
const iniTypeRef = ref<InstanceType<typeof SignatureTypePad> | null>(null);
const sigFileInput = ref<HTMLInputElement | null>(null);
const iniFileInput = ref<HTMLInputElement | null>(null);

watch(
  () => props.isOpen,
  (open) => {
    if (open) ensureSignatureFonts();
  },
);

function handleSigResult(result: SignatureFieldDefinition | null) {
  sigResult.value = result ? { field: result } : null;
}

function handleIniResult(result: SignatureFieldDefinition | null) {
  iniResult.value = result ? { field: result } : null;
}

const sigUpload = useSignatureUpload({ onResult: handleSigResult });
const iniUpload = useSignatureUpload({ onResult: handleIniResult });

watch(sigFileInput, (el) => {
  sigUpload.inputRef.value = el;
});
watch(iniFileInput, (el) => {
  iniUpload.inputRef.value = el;
});

function clearAll() {
  sigDrawRef.value?.clear();
  iniDrawRef.value?.clear();
  sigTypeRef.value?.clear();
  iniTypeRef.value?.clear();
  sigUpload.clear();
  iniUpload.clear();
  sigResult.value = null;
  iniResult.value = null;
}

function resetState() {
  activeTab.value = 'draw';
  selectedFont.value = FONTS[0].family;
  selectedColor.value = COLORS[0].value;
  clearAll();
}

function handleTabChange(tab: CreationTab) {
  clearAll();
  activeTab.value = tab;
}

function handleSave() {
  if (!sigResult.value || !signatureCapability.value) return;

  signatureCapability.value.addEntry({
    signature: sigResult.value.field,
    ...(iniResult.value && { initials: iniResult.value.field }),
  });

  resetState();
  props.onClose?.();
}

function handleClose() {
  resetState();
  props.onClose?.();
}

const canSave = computed(() => sigResult.value && (!needsInitials.value || iniResult.value));

const tabs: Array<{ id: CreationTab; labelKey: string; fallback: string }> = [
  { id: 'draw', labelKey: 'signature.create.draw', fallback: 'Draw' },
  { id: 'type', labelKey: 'signature.create.type', fallback: 'Type' },
  { id: 'upload', labelKey: 'signature.create.upload', fallback: 'Upload' },
];

const padHeight = 140;
</script>

<template>
  <Dialog
    :open="!!isOpen"
    :title="translate('signature.create.title', { fallback: 'Create Signature' })"
    :onClose="handleClose"
    :className="needsInitials ? 'md:!w-[42rem]' : ''"
    :maxWidth="needsInitials ? '42rem' : '32rem'"
  >
    <div class="flex flex-col gap-4">
      <!-- Tab selector -->
      <div class="flex gap-1 border-b border-gray-200">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          class="px-4 py-2 text-sm font-medium transition-colors"
          :class="
            activeTab === tab.id
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-400 hover:text-gray-900'
          "
          @click="handleTabChange(tab.id)"
        >
          {{ translate(tab.labelKey, { fallback: tab.fallback }) }}
        </button>
      </div>

      <!-- Pads -->
      <div class="flex gap-4">
        <!-- Signature pad -->
        <div class="flex flex-col gap-2" :class="needsInitials ? 'flex-[2]' : 'flex-1'">
          <div class="flex items-center justify-between">
            <span class="text-xs font-medium text-gray-500">
              {{ translate('signature.create.signatureLabel', { fallback: 'Signature' }) }}
            </span>
            <button
              class="text-xs text-gray-400 underline hover:text-gray-900"
              @click="
                activeTab === 'draw'
                  ? sigDrawRef?.clear()
                  : activeTab === 'type'
                    ? sigTypeRef?.clear()
                    : sigUpload.clear()
              "
            >
              {{ translate('signature.create.clear', { fallback: 'Clear' }) }}
            </button>
          </div>

          <div :style="{ height: `${padHeight}px` }">
            <SignatureDrawPad
              v-if="activeTab === 'draw'"
              ref="sigDrawRef"
              :onResult="handleSigResult"
              :strokeColor="selectedColor"
              class="rounded border border-gray-200"
            />
            <SignatureTypePad
              v-else-if="activeTab === 'type'"
              ref="sigTypeRef"
              :onResult="handleSigResult"
              :fontFamily="selectedFont"
              :color="selectedColor"
              class="rounded border border-gray-200 px-3 py-2"
              :placeholder="
                translate('signature.create.typePlaceholder', { fallback: 'e.g. John Smith' })
              "
            />
            <template v-else>
              <input
                ref="sigFileInput"
                type="file"
                :accept="sigUpload.accept"
                @change="sigUpload.handleFileInputChange"
                style="display: none"
              />
              <div
                class="flex w-full cursor-pointer items-center justify-center rounded border-2 border-dashed transition-colors"
                :class="
                  sigUpload.isDragging.value
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-400'
                "
                :style="{ height: `${padHeight}px` }"
                @click="sigUpload.openFilePicker"
                @drop="sigUpload.handleDrop"
                @dragover="sigUpload.handleDragOver"
                @dragleave="sigUpload.handleDragLeave"
              >
                <img
                  v-if="sigUpload.previewUrl.value"
                  :src="sigUpload.previewUrl.value"
                  :style="{ maxWidth: '90%', maxHeight: '90%', objectFit: 'contain' }"
                  alt="Upload preview"
                />
                <span v-else class="px-4 text-center text-xs text-gray-400">
                  {{
                    translate('signature.create.uploadPlaceholder', {
                      fallback: 'Click or drag an image here',
                    })
                  }}
                </span>
              </div>
            </template>
          </div>
        </div>

        <!-- Initials pad -->
        <div v-if="needsInitials" class="flex flex-1 flex-col gap-2">
          <div class="flex items-center justify-between">
            <span class="text-xs font-medium text-gray-500">
              {{ translate('signature.create.initialsLabel', { fallback: 'Initials' }) }}
            </span>
            <button
              class="text-xs text-gray-400 underline hover:text-gray-900"
              @click="
                activeTab === 'draw'
                  ? iniDrawRef?.clear()
                  : activeTab === 'type'
                    ? iniTypeRef?.clear()
                    : iniUpload.clear()
              "
            >
              {{ translate('signature.create.clear', { fallback: 'Clear' }) }}
            </button>
          </div>

          <div :style="{ height: `${padHeight}px` }">
            <SignatureDrawPad
              v-if="activeTab === 'draw'"
              ref="iniDrawRef"
              :onResult="handleIniResult"
              :strokeColor="selectedColor"
              class="rounded border border-gray-200"
            />
            <SignatureTypePad
              v-else-if="activeTab === 'type'"
              ref="iniTypeRef"
              :onResult="handleIniResult"
              :fontFamily="selectedFont"
              :color="selectedColor"
              class="rounded border border-gray-200 px-3 py-2"
              :placeholder="
                translate('signature.create.initialsPlaceholder', { fallback: 'e.g. JS' })
              "
            />
            <template v-else>
              <input
                ref="iniFileInput"
                type="file"
                :accept="iniUpload.accept"
                @change="iniUpload.handleFileInputChange"
                style="display: none"
              />
              <div
                class="flex w-full cursor-pointer items-center justify-center rounded border-2 border-dashed transition-colors"
                :class="
                  iniUpload.isDragging.value
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-400'
                "
                :style="{ height: `${padHeight}px` }"
                @click="iniUpload.openFilePicker"
                @drop="iniUpload.handleDrop"
                @dragover="iniUpload.handleDragOver"
                @dragleave="iniUpload.handleDragLeave"
              >
                <img
                  v-if="iniUpload.previewUrl.value"
                  :src="iniUpload.previewUrl.value"
                  :style="{ maxWidth: '90%', maxHeight: '90%', objectFit: 'contain' }"
                  alt="Upload preview"
                />
                <span v-else class="px-4 text-center text-xs text-gray-400">
                  {{
                    translate('signature.create.uploadPlaceholder', {
                      fallback: 'Click or drag an image here',
                    })
                  }}
                </span>
              </div>
            </template>
          </div>
        </div>
      </div>

      <!-- Controls: font selector + color picker -->
      <div v-if="activeTab === 'draw' || activeTab === 'type'" class="flex items-center gap-4">
        <div v-if="activeTab === 'type'" class="flex items-center gap-2">
          <label class="text-xs text-gray-500">
            {{ translate('signature.create.font', { fallback: 'Font' }) }}
          </label>
          <select
            class="rounded border border-gray-200 bg-white px-2 py-1 text-sm text-gray-900"
            :value="selectedFont"
            @change="selectedFont = ($event.target as HTMLSelectElement).value"
          >
            <option
              v-for="f in FONTS"
              :key="f.family"
              :value="f.family"
              :style="{ fontFamily: f.family }"
            >
              {{ f.name }}
            </option>
          </select>
        </div>

        <div class="flex items-center gap-2">
          <label class="text-xs text-gray-500">
            {{ translate('signature.create.color', { fallback: 'Color' }) }}
          </label>
          <div class="flex gap-1.5">
            <button
              v-for="c in COLORS"
              :key="c.value"
              :title="c.name"
              class="h-6 w-6 rounded-full border-2 transition-all"
              :class="
                selectedColor === c.value
                  ? 'scale-110 border-blue-500'
                  : 'border-gray-200 hover:scale-105'
              "
              :style="{ backgroundColor: c.value }"
              @click="selectedColor = c.value"
            />
          </div>
        </div>
      </div>

      <!-- Actions -->
      <div class="flex justify-end gap-2">
        <button
          class="rounded-md px-3 py-1.5 text-sm text-gray-400 transition-colors hover:text-gray-900"
          @click="handleClose"
        >
          {{ translate('signature.create.cancel', { fallback: 'Cancel' }) }}
        </button>
        <button
          class="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="!canSave"
          @click="handleSave"
        >
          {{ translate('signature.create.save', { fallback: 'Save' }) }}
        </button>
      </div>
    </div>
  </Dialog>
</template>
