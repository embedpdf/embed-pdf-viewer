<script setup lang="ts">
import { useSignatureState } from '@embedpdf/vue/signature';

const { signatures } = useSignatureState();
</script>

<template>
  <ul>
    <li v-for="sig in signatures" :key="sig.fieldName">
      {{ sig.fieldName }}: {{ sig.verdict?.summary ?? 'checking…' }}
    </li>
  </ul>
</template>
