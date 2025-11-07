<script setup lang="ts">
import { ref, computed } from 'vue';
import { useDocumentManagerCapability } from '@embedpdf/plugin-document-manager/vue';
import { PdfErrorCode } from '@embedpdf/models';
import type { DocumentState } from '@embedpdf/core';

interface Props {
  documentState: DocumentState;
}

const props = defineProps<Props>();

const { provides } = useDocumentManagerCapability();
const password = ref('');
const isRetrying = ref(false);

// Clean logic using state + error code
const isPasswordError = computed(() => props.documentState.errorCode === PdfErrorCode.Password);
const isPasswordRequired = computed(
  () => isPasswordError.value && !props.documentState.passwordProvided,
);
const isPasswordIncorrect = computed(
  () => isPasswordError.value && props.documentState.passwordProvided,
);

const handleRetry = async () => {
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

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Enter' && !isRetrying.value && password.value.trim()) {
    handleRetry();
  }
};
</script>

<template>
  <!-- Non-password error -->
  <div v-if="!isPasswordError" class="d-flex fill-height align-center pa-8 justify-center">
    <v-alert type="error" variant="tonal" max-width="500" class="ma-4">
      <v-alert-title>
        <v-icon icon="mdi-alert-circle" class="mr-2"></v-icon>
        Error loading document
      </v-alert-title>
      <div class="mt-2">{{ documentState.error ?? 'An unknown error occurred' }}</div>
      <div v-if="documentState.errorCode" class="text-caption mt-1">
        Error Code: {{ documentState.errorCode }}
      </div>
      <template #actions>
        <v-btn color="error" variant="text" @click="handleClose"> Close Document </v-btn>
      </template>
    </v-alert>
  </div>

  <!-- Password prompt -->
  <div v-else class="d-flex fill-height align-center pa-8 justify-center">
    <v-card max-width="500" class="w-100">
      <v-card-title class="d-flex align-center justify-space-between">
        <div>
          <div class="text-h6">Password Required</div>
          <div v-if="documentState.name" class="text-body-2 text-medium-emphasis mt-1">
            {{ documentState.name }}
          </div>
        </div>
        <v-btn
          icon="mdi-close"
          variant="text"
          size="small"
          :disabled="isRetrying"
          @click="handleClose"
        ></v-btn>
      </v-card-title>

      <v-card-text>
        <!-- Different message based on state -->
        <v-alert
          v-if="isPasswordRequired"
          type="warning"
          variant="tonal"
          density="compact"
          class="mb-4"
        >
          This document is password protected. Please enter the password to open it.
        </v-alert>

        <v-alert
          v-if="isPasswordIncorrect"
          type="warning"
          variant="tonal"
          density="compact"
          class="mb-4"
        >
          The password you entered was incorrect. Please try again.
        </v-alert>

        <v-text-field
          v-model="password"
          type="password"
          label="Password"
          placeholder="Enter document password"
          variant="outlined"
          density="comfortable"
          :disabled="isRetrying"
          autofocus
          @keydown="handleKeydown"
        ></v-text-field>

        <!-- Show error feedback for incorrect password -->
        <v-alert
          v-if="isPasswordIncorrect"
          type="error"
          variant="tonal"
          density="compact"
          class="mt-2"
        >
          Incorrect password. Please check and try again.
        </v-alert>
      </v-card-text>

      <v-card-actions class="pa-4 justify-end">
        <v-btn variant="text" :disabled="isRetrying" @click="handleClose"> Cancel </v-btn>
        <v-btn
          color="primary"
          variant="elevated"
          :disabled="isRetrying || !password.trim()"
          :loading="isRetrying"
          @click="handleRetry"
        >
          {{ isRetrying ? 'Opening...' : 'Open' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </div>
</template>
