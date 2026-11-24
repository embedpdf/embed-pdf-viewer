<!-- Render it where the document shows, so every document you open gets its own list. -->
<script setup lang="ts">
import { watchEffect } from 'vue';
import { useForm, type FormGroupInput } from '@embedpdf/vue/form';

const props = defineProps<{ signers: FormGroupInput[] }>();
const form = useForm();

watchEffect(() => form.setGroups(props.signers));
</script>

<template></template>
