<script setup lang="ts">
import { ref, computed } from 'vue';
import { type DocumentState } from '@embedpdf/core';
import { useDocumentManagerCapability } from '@embedpdf/plugin-document-manager/vue';
import { Viewport } from '@embedpdf/plugin-viewport/vue';
import { Scroller } from '@embedpdf/plugin-scroll/vue';
import { RenderLayer } from '@embedpdf/plugin-render/vue';
import { TilingLayer } from '@embedpdf/plugin-tiling/vue';
import { PdfErrorCode } from '@embedpdf/models';
import { Lock, AlertCircle, X, Eye, EyeOff, FileText, Loader2 } from 'lucide-vue-next';

const props = defineProps<{
  documentState: DocumentState;
  documentId?: string;
  isLoaded?: boolean;
}>();

const { provides } = useDocumentManagerCapability();

const password = ref('');
const showPassword = ref(false);
const isRetrying = ref(false);

const isPasswordError = computed(() => props.documentState?.errorCode === PdfErrorCode.Password);
const isPasswordRequired = computed(
  () => isPasswordError.value && !props.documentState?.passwordProvided,
);
const isPasswordIncorrect = computed(
  () => isPasswordError.value && props.documentState?.passwordProvided,
);

const handleRetry = () => {
  if (!provides.value || !password.value.trim()) return;
  isRetrying.value = true;

  const task = provides.value.retryDocument(props.documentState.id, { password: password.value });
  task.wait(
    () => {
      password.value = '';
      isRetrying.value = false;
    },
    (error) => {
      console.error('Retry failed:', error);
      isRetrying.value = false;
    },
  );
};

const handleClose = () => {
  provides.value?.closeDocument(props.documentState.id);
};

const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Enter' && !isRetrying.value && password.value.trim()) {
    handleRetry();
  }
};
</script>

<template>
  <!-- Loaded state - show the PDF viewer -->
  <div v-if="isLoaded && documentId" class="relative h-[400px] sm:h-[500px]">
    <Viewport :document-id="documentId" class="absolute inset-0 bg-gray-200 dark:bg-gray-800">
      <Scroller :document-id="documentId">
        <template #default="{ page }">
          <div
            :style="{ width: page.width + 'px', height: page.height + 'px', position: 'relative' }"
          >
            <RenderLayer :document-id="documentId" :page-index="page.pageIndex" />
            <TilingLayer :document-id="documentId" :page-index="page.pageIndex" />
          </div>
        </template>
      </Scroller>
    </Viewport>
  </div>

  <!-- Generic error state (non-password errors) -->
  <div v-else-if="!isPasswordError" class="flex h-full items-center justify-center p-8">
    <div class="w-full max-w-sm text-center">
      <div
        class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30"
      >
        <AlertCircle class="h-6 w-6 text-red-600 dark:text-red-400" />
      </div>
      <h3 class="mt-4 text-base font-semibold text-gray-900 dark:text-gray-100">
        Error loading document
      </h3>
      <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
        {{ documentState?.error || 'An unknown error occurred' }}
      </p>
      <p v-if="documentState?.errorCode" class="mt-1 text-xs text-gray-500 dark:text-gray-500">
        Error code: {{ documentState.errorCode }}
      </p>
      <button
        @click="handleClose"
        class="mt-4 inline-flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-gray-300 transition-colors hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600"
      >
        Close Document
      </button>
    </div>
  </div>

  <!-- Password prompt -->
  <div v-else class="flex h-full items-center justify-center p-4 sm:p-8">
    <div
      class="w-full max-w-sm overflow-hidden rounded-lg border border-gray-300 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900"
    >
      <!-- Header -->
      <div
        class="flex items-start justify-between gap-4 border-b border-gray-200 p-4 dark:border-gray-700"
      >
        <div class="flex items-center gap-3">
          <div
            class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30"
          >
            <Lock class="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div class="min-w-0">
            <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Password Required
            </h3>
            <p
              v-if="documentState?.name"
              class="mt-0.5 flex items-center gap-1 truncate text-xs text-gray-500 dark:text-gray-400"
            >
              <FileText :size="12" />
              {{ documentState.name }}
            </p>
          </div>
        </div>
        <button
          @click="handleClose"
          :disabled="isRetrying"
          class="rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50 dark:hover:bg-gray-800 dark:hover:text-gray-300"
        >
          <X :size="16" />
        </button>
      </div>

      <!-- Content -->
      <div class="p-4">
        <p class="text-sm text-gray-600 dark:text-gray-400">
          <template v-if="isPasswordRequired">
            This document is protected. Enter the password to view it.
          </template>
          <template v-if="isPasswordIncorrect"> Incorrect password. Please try again. </template>
        </p>

        <!-- Password Input -->
        <div class="mt-4">
          <label class="mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-300">
            Password
          </label>
          <div class="relative">
            <input
              :type="showPassword ? 'text' : 'password'"
              v-model="password"
              @keydown="handleKeyDown"
              :disabled="isRetrying"
              placeholder="Enter password"
              :class="[
                'block w-full rounded-md border bg-white px-3 py-2 pr-10 text-sm text-gray-900 placeholder-gray-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500',
                isPasswordIncorrect
                  ? 'border-red-300 dark:border-red-700'
                  : 'border-gray-300 dark:border-gray-600',
              ]"
            />
            <button
              type="button"
              @click="showPassword = !showPassword"
              class="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <EyeOff v-if="showPassword" :size="16" />
              <Eye v-else :size="16" />
            </button>
          </div>
        </div>

        <!-- Error message -->
        <div
          v-if="isPasswordIncorrect"
          class="mt-3 flex items-center gap-2 text-xs text-red-600 dark:text-red-400"
        >
          <AlertCircle :size="14" />
          <span>The password you entered is incorrect</span>
        </div>
      </div>

      <!-- Footer -->
      <div
        class="flex justify-end gap-2 border-t border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/50"
      >
        <button
          @click="handleClose"
          :disabled="isRetrying"
          class="rounded-md px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-gray-300 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-700"
        >
          Cancel
        </button>
        <button
          @click="handleRetry"
          :disabled="isRetrying || !password.trim()"
          class="inline-flex items-center gap-2 rounded-md bg-blue-500 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <template v-if="isRetrying">
            <Loader2 :size="14" class="animate-spin" />
            Opening...
          </template>
          <template v-else> Unlock </template>
        </button>
      </div>
    </div>
  </div>
</template>
