<script setup lang="ts">
import { useStampAssetPreviewUrl } from '@embedpdf/vue/stamp';

const props = defineProps<{ assetId: string; label: string }>();
const emit = defineEmits<{ pick: [] }>();

const url = useStampAssetPreviewUrl(() => props.assetId);
</script>

<template>
  <button type="button" class="button" :title="label" @click="emit('pick')">
    <img v-if="url" :src="url" :alt="label" class="preview" />
    <template v-else>{{ label }}</template>
  </button>
</template>
