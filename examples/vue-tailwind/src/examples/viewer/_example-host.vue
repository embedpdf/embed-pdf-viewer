<script setup lang="ts">
/**
 * Generic host wrapper for docs website embeds.
 *
 * - Watches `<html class="dark">` (Tailwind dark mode) and derives `themePreference`
 * - Renders an arbitrary Vue component via `<component :is="...">`
 * - Passes `themePreference` down as a prop
 */
import { ref, onMounted, onUnmounted, type Component as VueComponent, shallowRef } from 'vue';

interface Props {
  component: VueComponent;
  componentProps?: Record<string, unknown>;
}

const props = withDefaults(defineProps<Props>(), {
  componentProps: () => ({}),
});

const themePreference = ref<'light' | 'dark'>('light');
let observer: MutationObserver | null = null;

onMounted(() => {
  const html = document.documentElement;

  const updateTheme = () => {
    themePreference.value = html.classList.contains('dark') ? 'dark' : 'light';
  };

  updateTheme();

  observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'attributes' && m.attributeName === 'class') {
        updateTheme();
      }
    }
  });

  observer.observe(html, { attributes: true });
});

onUnmounted(() => {
  observer?.disconnect();
});
</script>

<template>
  <component
    :is="props.component"
    v-bind="props.componentProps"
    :theme-preference="themePreference"
  />
</template>
