<!-- The gate's fallback: a document on its way, or none at all. -->
<script setup lang="ts">
import { useDocument } from '@embedpdf/vue/runtime';

const { id } = useDocument();
</script>

<template>
  <p class="loading">{{ id ? 'Opening…' : 'No document is open. Open a PDF to see it here.' }}</p>
</template>
