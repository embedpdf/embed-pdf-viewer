<script setup lang="ts">
import { computed } from 'vue';
import { hasAutoMountElements, type PluginBatchRegistration, type IPlugin } from '@embedpdf/core';
import NestedWrapper from './nested-wrapper.vue';

const props = defineProps<{
  plugins: PluginBatchRegistration<IPlugin<any>, any>[];
}>();

const elements = computed(() => {
  const utilities: any[] = [];
  const wrappers: any[] = [];

  for (const reg of props.plugins) {
    const pkg = reg.package;
    if (hasAutoMountElements(pkg)) {
      const elements = pkg.autoMountElements() || [];

      for (const element of elements) {
        if (element.type === 'utility') {
          utilities.push(element.component);
        } else if (element.type === 'wrapper') {
          wrappers.push(element.component);
        }
      }
    }
  }

  return { utilities, wrappers };
});
</script>

<template>
  <NestedWrapper
    v-if="elements.wrappers.length > 0"
    :wrappers="elements.wrappers"
    :utilities="elements.utilities"
  >
    <slot />
  </NestedWrapper>
  <template v-else>
    <!-- No wrappers - render children and utilities directly -->
    <slot />
    <component
      v-for="(utility, index) in elements.utilities"
      :key="`utility-${index}`"
      :is="utility"
    />
  </template>
</template>
