<!-- The form starts once the properties have been read from the file. -->
<script setup lang="ts">
import { useMetadataState } from '@embedpdf/vue/metadata';
import PropertiesForm from './PropertiesForm.vue';

const fields = useMetadataState((state) => state.metadata);
</script>

<template>
  <PropertiesForm v-if="fields" :initial="fields" />
  <p v-else class="loading">Reading…</p>
</template>
