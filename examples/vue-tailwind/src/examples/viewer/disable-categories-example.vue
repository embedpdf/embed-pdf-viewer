<script setup lang="ts">
import { ref, watch } from 'vue';
import {
  PDFViewer,
  type EmbedPdfContainer,
  type PluginRegistry,
  type CommandsPlugin,
  type UIPlugin,
} from '@embedpdf/vue-pdf-viewer';

interface Props {
  themePreference?: 'light' | 'dark';
}

const props = withDefaults(defineProps<Props>(), {
  themePreference: 'light',
});

const container = ref<EmbedPdfContainer | null>(null);
const registry = ref<PluginRegistry | null>(null);
const disabledCategories = ref<string[]>([]);

const handleInit = (c: EmbedPdfContainer) => {
  container.value = c;
};

const handleReady = (r: PluginRegistry) => {
  registry.value = r;
};

watch(
  () => props.themePreference,
  (preference) => {
    container.value?.setTheme({ preference });
  },
);

watch(
  disabledCategories,
  (categories) => {
    if (!registry.value) return;

    const commands = registry.value.getPlugin<CommandsPlugin>('commands')?.provides();
    if (commands) {
      commands.setDisabledCategories(categories);
    }

    const ui = registry.value.getPlugin<UIPlugin>('ui')?.provides();
    if (ui) {
      ui.setDisabledCategories(categories);
    }
  },
  { deep: true },
);

const categories = [
  { id: 'annotation', label: 'Annotations' },
  { id: 'redaction', label: 'Redaction' },
  { id: 'zoom', label: 'Zoom' },
  { id: 'document-print', label: 'Print' },
  { id: 'document-export', label: 'Export' },
  { id: 'panel', label: 'Sidebars' },
];

const toggleCategory = (categoryId: string) => {
  if (disabledCategories.value.includes(categoryId)) {
    disabledCategories.value = disabledCategories.value.filter((id) => id !== categoryId);
  } else {
    disabledCategories.value = [...disabledCategories.value, categoryId];
  }
};
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- Controls -->
    <div
      class="flex flex-col gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800"
    >
      <h4 class="font-medium text-gray-900 dark:text-gray-100">Disable Categories</h4>
      <div class="flex flex-wrap gap-4">
        <label
          v-for="category in categories"
          :key="category.id"
          class="flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-300"
        >
          <input
            type="checkbox"
            :checked="disabledCategories.includes(category.id)"
            @change="toggleCategory(category.id)"
            class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          {{ category.label }}
        </label>
      </div>
      <div class="text-xs text-gray-500">
        Selected: {{ disabledCategories.length > 0 ? disabledCategories.join(', ') : '(none)' }}
      </div>
    </div>

    <!-- Viewer Container -->
    <div
      class="h-[500px] w-full overflow-hidden rounded-xl border border-gray-300 shadow-lg dark:border-gray-600"
    >
      <PDFViewer
        @init="handleInit"
        @ready="handleReady"
        :config="{
          src: 'https://snippet.embedpdf.com/ebook.pdf',
          theme: { preference: themePreference },
          disabledCategories: disabledCategories,
        }"
        :style="{ width: '100%', height: '100%' }"
      />
    </div>
  </div>
</template>
