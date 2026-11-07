<script setup lang="ts">
import { onMounted } from 'vue';
import { useInteraction } from '@embedpdf/vue/interaction';

// On load: the stamp tool is active.
const interaction = useInteraction();

onMounted(() => interaction.activateTool('stamp'));
</script>

<template></template>
