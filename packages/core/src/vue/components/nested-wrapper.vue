<script setup lang="ts">
defineProps<{
  wrappers: any[];
  utilities?: any[];
}>();
</script>

<template>
  <component :is="wrappers[0]">
    <NestedWrapper v-if="wrappers.length > 1" :wrappers="wrappers.slice(1)" :utilities="utilities">
      <slot />
    </NestedWrapper>
    <template v-else>
      <slot />
      <!-- Render utilities inside the innermost wrapper -->
      <component v-for="(utility, index) in utilities" :key="`utility-${index}`" :is="utility" />
    </template>
  </component>
</template>
