<script setup lang="ts">
import { onMounted } from 'vue';
import { useInteraction } from '@embedpdf/vue/interaction';

// On load: the pen is active.
const interaction = useInteraction();

onMounted(() => interaction.activateTool('ink'));
</script>

<template></template>
