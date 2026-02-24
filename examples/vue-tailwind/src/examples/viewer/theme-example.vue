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

// Available brand colors to choose from
const brandColors = [
  {
    name: 'Purple',
    primary: '#9333ea',
    hover: '#7e22ce',
    active: '#6b21a8',
    light: '#f3e8ff',
    darkLight: '#3b0764',
  },
  {
    name: 'Blue',
    primary: '#2563eb',
    hover: '#1d4ed8',
    active: '#1e40af',
    light: '#dbeafe',
    darkLight: '#1e3a8a',
  },
  {
    name: 'Green',
    primary: '#16a34a',
    hover: '#15803d',
    active: '#166534',
    light: '#dcfce7',
    darkLight: '#14532d',
  },
  {
    name: 'Orange',
    primary: '#ea580c',
    hover: '#c2410c',
    active: '#9a3412',
    light: '#ffedd5',
    darkLight: '#7c2d12',
  },
  {
    name: 'Pink',
    primary: '#db2777',
    hover: '#be185d',
    active: '#9d174d',
    light: '#fce7f3',
    darkLight: '#831843',
  },
];

const selectedColor = ref(brandColors[0]);

watch(
  () => props.themePreference,
  (preference) => {
    container.value?.setTheme({ preference });
  },
);

const changeColor = (color: (typeof brandColors)[0]) => {
  selectedColor.value = color;
  container.value?.setTheme({
    preference: props.themePreference,
    light: {
      accent: {
        primary: color.primary,
        primaryHover: color.hover,
        primaryActive: color.active,
        primaryLight: color.light,
        primaryForeground: '#ffffff',
      },
    },
    dark: {
      accent: {
        primary: color.primary,
        primaryHover: color.hover,
        primaryActive: color.active,
        primaryLight: color.darkLight,
        primaryForeground: '#ffffff',
      },
    },
  });
};
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- Color Selection -->
    <div
      class="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800"
    >
      <span class="text-sm font-medium text-gray-700 dark:text-gray-300">
        Choose brand color:
      </span>
      <div class="flex gap-2">
        <button
          v-for="color in brandColors"
          :key="color.name"
          type="button"
          @click="changeColor(color)"
          class="h-8 w-8 rounded-full border-2 transition-transform hover:scale-110"
          :class="
            selectedColor.name === color.name
              ? 'border-gray-900 ring-2 ring-offset-2 dark:border-white'
              : 'border-transparent'
          "
          :style="{ backgroundColor: color.primary }"
          :title="color.name"
        ></button>
      </div>
      <span class="text-sm text-gray-500 dark:text-gray-400">
        Selected: <strong>{{ selectedColor.name }}</strong>
      </span>
    </div>

    <!-- Viewer Container -->
    <div
      class="h-[600px] w-full overflow-hidden rounded-xl border border-gray-300 shadow-lg dark:border-gray-600"
    >
      <PDFViewer
        @init="handleInit"
        :config="{
          src: 'https://snippet.embedpdf.com/ebook.pdf',
          theme: {
            preference: themePreference,
            light: {
              accent: {
                primary: selectedColor.primary,
                primaryHover: selectedColor.hover,
                primaryActive: selectedColor.active,
                primaryLight: selectedColor.light,
                primaryForeground: '#ffffff',
              },
            },
            dark: {
              accent: {
                primary: selectedColor.primary,
                primaryHover: selectedColor.hover,
                primaryActive: selectedColor.active,
                primaryLight: selectedColor.darkLight,
                primaryForeground: '#ffffff',
              },
            },
          },
        }"
        :style="{ width: '100%', height: '100%' }"
      />
    </div>
  </div>
</template>
