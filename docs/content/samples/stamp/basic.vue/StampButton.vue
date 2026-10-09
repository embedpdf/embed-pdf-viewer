<!-- One stamp, shown by its preview: a click arms it, a second click disarms it. -->
<script setup lang="ts">
import { useStamp, useStampAssetPreviewUrl } from '@embedpdf/vue/stamp';
import type { StampAsset } from '@embedpdf/vue/stamp';

const { asset, armed } = defineProps<{ asset: StampAsset; armed: boolean }>();

const stamp = useStamp();
const url = useStampAssetPreviewUrl(() => asset.id);

function toggle() {
  if (armed) stamp.disarm();
  else void stamp.armAsset(asset.id);
}
</script>

<template>
  <button type="button" class="button" :title="asset.label" :aria-pressed="armed" @click="toggle">
    <img v-if="url" :src="url" :alt="asset.label" class="preview" />
    <template v-else>{{ asset.label }}</template>
  </button>
</template>
