<template>
  <div v-if="provides" class="flex items-center gap-2 border-b border-gray-300 bg-white px-3 py-2">
    <!-- Redaction Mode Toggles -->
    <ToolbarButton
      :onClick="handleTextRedact"
      :isActive="state.activeType === RedactionMode.RedactSelection"
      aria-label="Redact text"
      title="Redact Text Selection"
    >
      <RedactTextIcon class="h-4 w-4" />
    </ToolbarButton>

    <ToolbarButton
      :onClick="handleAreaRedact"
      :isActive="state.activeType === RedactionMode.MarqueeRedact"
      aria-label="Redact area"
      title="Redact Area (Marquee)"
    >
      <RedactAreaIcon class="h-4 w-4" />
    </ToolbarButton>

    <!-- Divider -->
    <div class="mx-1 h-6 w-px bg-gray-300" />

    <!-- Action Buttons -->
    <button
      @click="handleCommitPending"
      :disabled="state.pendingCount === 0"
      class="rounded p-2 text-green-600 transition-colors hover:bg-green-50 disabled:cursor-not-allowed disabled:text-gray-400 disabled:hover:bg-transparent"
      aria-label="Apply redactions"
      :title="`Apply ${state.pendingCount} pending redaction(s)`"
    >
      <CheckIcon class="h-4 w-4" />
    </button>

    <button
      @click="handleClearPending"
      :disabled="state.pendingCount === 0"
      class="rounded p-2 text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:text-gray-400 disabled:hover:bg-transparent"
      aria-label="Clear redactions"
      :title="`Clear ${state.pendingCount} pending redaction(s)`"
    >
      <CloseIcon class="h-4 w-4" />
    </button>

    <span v-if="state.pendingCount > 0" class="ml-2 text-sm text-gray-600">
      {{ state.pendingCount }} pending redaction{{ state.pendingCount !== 1 ? 's' : '' }}
    </span>
  </div>
</template>

<script setup lang="ts">
import { RedactionMode, useRedaction } from '@embedpdf/plugin-redaction/vue';
import { ToolbarButton } from './ui';
import { CheckIcon, CloseIcon, RedactTextIcon, RedactAreaIcon } from './icons';

const props = defineProps<{
  documentId: string;
}>();

const { provides, state } = useRedaction(() => props.documentId);

const handleTextRedact = () => {
  provides.value?.toggleRedactSelection();
};

const handleAreaRedact = () => {
  provides.value?.toggleMarqueeRedact();
};

const handleCommitPending = () => {
  provides.value?.commitAllPending();
};

const handleClearPending = () => {
  provides.value?.clearPending();
};
</script>
