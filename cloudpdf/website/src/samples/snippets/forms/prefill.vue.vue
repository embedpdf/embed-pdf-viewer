<!-- Render it where the document shows: it fills in what the app knows when the person starts. -->
<script setup lang="ts">
import { onMounted } from 'vue';
import { useForm } from '@embedpdf/vue/form';

const form = useForm();

// A field that has a value is left alone, so a second call writes nothing.
onMounted(() => void form.prefill());
</script>

<template></template>
