<script setup lang="ts">
import { useMetadataState } from '@embedpdf/vue/metadata';

const { custom } = useMetadataState(); // { contractId: 'C-2026-114', reviewedBy: 'dana' }
</script>

<template>
  <span>Contract {{ custom?.contractId }}</span>
</template>
