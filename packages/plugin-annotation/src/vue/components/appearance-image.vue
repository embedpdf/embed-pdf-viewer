<template>
  <img
    v-if="imageUrl"
    :src="imageUrl"
    alt=""
    draggable="false"
    @load="handleImageLoad"
    :style="{
      position: 'absolute',
      width: '100%',
      height: '100%',
      display: 'block',
      pointerEvents: 'none',
      userSelect: 'none',
      ...style,
    }"
  />
</template>

<script setup lang="ts">
import { ref, watchEffect, type CSSProperties } from 'vue';
import type { AnnotationAppearanceImage } from '@embedpdf/models';

const props = defineProps<{
  appearance: AnnotationAppearanceImage<Blob>;
  style?: CSSProperties;
}>();

const imageUrl = ref<string | null>(null);
const urlRef = ref<string | null>(null);

watchEffect((onCleanup) => {
  const url = URL.createObjectURL(props.appearance.data);
  imageUrl.value = url;
  urlRef.value = url;

  onCleanup(() => {
    if (urlRef.value) {
      URL.revokeObjectURL(urlRef.value);
      urlRef.value = null;
    }
  });
});

const handleImageLoad = () => {
  if (urlRef.value) {
    URL.revokeObjectURL(urlRef.value);
    urlRef.value = null;
  }
};
</script>
