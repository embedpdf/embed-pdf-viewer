<template>
  <div
    ref="rootRef"
    v-bind="{ ...attrs, ...(rootAttrs as any) }"
    :style="{ containerType: 'inline-size' }"
  >
    <slot />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, useAttrs } from 'vue';
import { UI_ATTRIBUTES, UI_SELECTORS } from '@embedpdf/plugin-ui';
import { useUIPlugin, useUICapability } from './hooks/use-ui';

// Disable automatic attribute inheritance since we handle it manually
defineOptions({
  inheritAttrs: false,
});

const attrs = useAttrs();

const { plugin } = useUIPlugin();
const { provides } = useUICapability();

const disabledCategories = ref<string[]>([]);
const rootRef = ref<HTMLDivElement | null>(null);

let styleEl: HTMLStyleElement | null = null;
let styleTarget: HTMLElement | ShadowRoot | null = null;

/**
 * Find the style injection target for an element.
 * Returns the shadow root if inside one, otherwise document.head.
 */
function getStyleTarget(element: HTMLElement): HTMLElement | ShadowRoot {
  const root = element.getRootNode();
  if (root instanceof ShadowRoot) {
    return root;
  }
  return document.head;
}

/**
 * Inject or update stylesheet
 */
function injectStyles() {
  if (!rootRef.value || !plugin.value) {
    return;
  }

  styleTarget = getStyleTarget(rootRef.value);

  // Check if styles already exist in this target
  const existingStyle = styleTarget.querySelector(UI_SELECTORS.STYLES) as HTMLStyleElement | null;

  if (existingStyle) {
    styleEl = existingStyle;
    // Update content in case locale changed
    existingStyle.textContent = plugin.value.getStylesheet();
    return;
  }

  // Create and inject stylesheet
  const stylesheet = plugin.value.getStylesheet();
  const newStyleEl = document.createElement('style');
  newStyleEl.setAttribute(UI_ATTRIBUTES.STYLES, '');
  newStyleEl.textContent = stylesheet;

  if (styleTarget instanceof ShadowRoot) {
    styleTarget.insertBefore(newStyleEl, styleTarget.firstChild);
  } else {
    styleTarget.appendChild(newStyleEl);
  }

  styleEl = newStyleEl;
}

/**
 * Cleanup styles
 */
function cleanupStyles() {
  if (styleEl?.parentNode) {
    styleEl.remove();
  }
  styleEl = null;
  styleTarget = null;
}

// Build root element attributes
const rootAttrs = computed(() => {
  const result: Record<string, string> = {
    [UI_ATTRIBUTES.ROOT]: '',
  };

  if (disabledCategories.value.length > 0) {
    result[UI_ATTRIBUTES.DISABLED_CATEGORIES] = disabledCategories.value.join(' ');
  }

  return result;
});

// Stylesheet invalidation cleanup
let stylesheetCleanup: (() => void) | null = null;

// Category change cleanup
let categoryCleanup: (() => void) | null = null;

onMounted(() => {
  // Inject styles on mount
  injectStyles();

  // Subscribe to stylesheet invalidation
  if (plugin.value) {
    stylesheetCleanup = plugin.value.onStylesheetInvalidated(() => {
      if (styleEl && plugin.value) {
        styleEl.textContent = plugin.value.getStylesheet();
      }
    });
  }

  // Subscribe to category changes
  if (provides.value) {
    disabledCategories.value = provides.value.getDisabledCategories();

    categoryCleanup = provides.value.onCategoryChanged((event) => {
      disabledCategories.value = event.disabledCategories;
    });
  }
});

onUnmounted(() => {
  cleanupStyles();
  stylesheetCleanup?.();
  categoryCleanup?.();
});

// Re-inject styles if plugin changes
watch(plugin, () => {
  if (rootRef.value && plugin.value) {
    injectStyles();
  }
});
</script>
