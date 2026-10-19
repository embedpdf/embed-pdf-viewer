<script setup lang="ts">
import { useStampAssetPreviewUrl } from '@embedpdf/vue/stamp';

const { assetId } = defineProps<{ assetId: string }>();

const url = useStampAssetPreviewUrl(() => assetId);
</script>

<template>
  <img v-if="url" :src="url" alt="" />
</template>
