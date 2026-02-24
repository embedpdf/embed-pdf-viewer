<script setup lang="ts">
import { ref, watch } from 'vue';
import { PDFViewer, type EmbedPdfContainer } from '@embedpdf/vue-pdf-viewer';

interface Props {
  themePreference?: 'light' | 'dark';
}

const props = withDefaults(defineProps<Props>(), {
  themePreference: 'light',
});

const container = ref<EmbedPdfContainer | null>(null);

const handleInit = (c: EmbedPdfContainer) => {
  container.value = c;
};

watch(
  () => props.themePreference,
  (preference) => {
    container.value?.setTheme({ preference });
  },
);
</script>

<template>
  <div
    class="h-[600px] w-full overflow-hidden rounded-xl border border-gray-300 shadow-lg dark:border-gray-600"
  >
    <PDFViewer
      @init="handleInit"
      :config="{
        src: 'https://snippet.embedpdf.com/ebook.pdf',
        theme: { preference: themePreference },
      }"
      :style="{ width: '100%', height: '100%' }"
    />
  </div>
</template>
