<script setup lang="ts">
import { useStamp, useStampAssets } from '@embedpdf/vue/stamp';

import StampPreview from './preview.vue';

const { libraryId } = defineProps<{ libraryId: string }>();

const stamp = useStamp();
const assets = useStampAssets(() => ({ libraryId }));
</script>

<template>
  <button v-for="asset in assets" :key="asset.id" @click="stamp.armAsset(asset.id)">
    <StampPreview :asset-id="asset.id" />
    {{ asset.label }}
  </button>
</template>
