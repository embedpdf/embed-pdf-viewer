<script setup lang="ts">
import { useActionsUiAdapter } from '@embedpdf/vue/actions';
import { toast } from './toast';

useActionsUiAdapter({
  openUri: (uri) => {
    if (confirm(`Open ${uri}?`)) window.open(uri, '_blank', 'noopener');
  },
  alert: (message) => toast(message),
});
</script>

<template>
  <!-- your viewer -->
</template>
