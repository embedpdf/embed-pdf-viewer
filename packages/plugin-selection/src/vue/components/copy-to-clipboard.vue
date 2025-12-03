<script setup lang="ts">
import { watchEffect } from 'vue';
import { useSelectionCapability } from '../hooks';

const { provides: sel } = useSelectionCapability();

// This effect runs when the component is mounted and the capability is available.
// It automatically handles unsubscribing when the component is unmounted.
watchEffect((onCleanup) => {
  if (sel.value) {
    const unsubscribe = sel.value.onCopyToClipboard(({ text }) => {
      // Use the Clipboard API to write the text
      navigator.clipboard.writeText(text).catch((err) => {
        console.error('Failed to copy text to clipboard:', err);
      });
    });

    // Register the cleanup function to run on unmount or re-run
    onCleanup(unsubscribe);
  }
});
</script>

<template>
  <!-- This component renders nothing to the DOM -->
</template>
