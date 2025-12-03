<template>
  <div class="flex h-full items-center justify-center bg-gray-50 p-8">
    <div class="w-full max-w-md rounded-lg bg-white p-8 shadow-lg">
      <div class="mb-6 flex items-center justify-center">
        <div class="rounded-full bg-yellow-100 p-4">
          <AlertIcon class="h-12 w-12 text-yellow-600" />
        </div>
      </div>

      <h2 class="mb-4 text-center text-2xl font-bold text-gray-900">Password Required</h2>

      <p class="mb-6 text-center text-gray-600">
        This document is password protected. Please enter the password to view it.
      </p>

      <form @submit.prevent="handleSubmit" class="space-y-4">
        <div>
          <label for="password" class="mb-2 block text-sm font-medium text-gray-700">
            Document Password
          </label>
          <input
            id="password"
            v-model="password"
            type="password"
            :disabled="isSubmitting"
            autocomplete="off"
            class="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-gray-100"
            placeholder="Enter password"
            ref="passwordInput"
          />
        </div>

        <div v-if="errorMessage" class="rounded-lg bg-red-50 p-3 text-sm text-red-600">
          {{ errorMessage }}
        </div>

        <div class="flex gap-3">
          <button
            type="button"
            @click="handleCancel"
            :disabled="isSubmitting"
            class="flex-1 rounded-lg border-2 border-gray-300 px-6 py-3 font-semibold text-gray-700 transition-colors hover:border-gray-400 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            :disabled="!password || isSubmitting"
            class="flex-1 rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400"
          >
            <span v-if="!isSubmitting">Unlock</span>
            <span v-else class="flex items-center justify-center gap-2">
              <LoadingSpinner size="sm" />
              Unlocking...
            </span>
          </button>
        </div>
      </form>

      <div class="mt-6 rounded-lg bg-blue-50 p-4">
        <p class="text-xs text-blue-900">
          <strong>Note:</strong> The password you enter is used only to decrypt the PDF file locally
          in your browser. It is never sent to any server.
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import type { DocumentState } from '@embedpdf/core';
import { useDocumentManagerCapability } from '@embedpdf/plugin-document-manager/vue';
import LoadingSpinner from './LoadingSpinner.vue';
import { AlertIcon } from './icons';

const props = defineProps<{
  documentState: DocumentState;
}>();

const password = ref('');
const errorMessage = ref('');
const isSubmitting = ref(false);
const passwordInput = ref<HTMLInputElement | null>(null);

const { provides: documentManager } = useDocumentManagerCapability();

onMounted(() => {
  passwordInput.value?.focus();
});

const handleSubmit = async () => {
  if (!password.value || !documentManager) return;

  isSubmitting.value = true;
  errorMessage.value = '';

  try {
    await documentManager.retryLoadDocumentWithPassword(props.documentState.id, password.value);
  } catch (error) {
    errorMessage.value = 'Incorrect password. Please try again.';
    password.value = '';
    passwordInput.value?.focus();
  } finally {
    isSubmitting.value = false;
  }
};

const handleCancel = () => {
  if (!documentManager) return;
  documentManager.closeDocument(props.documentState.id);
};
</script>
