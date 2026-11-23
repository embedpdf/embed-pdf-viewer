<!-- TextBox.vue -->
<script setup lang="ts">
import type { FieldControlProps } from '@embedpdf/vue/form';

defineProps<FieldControlProps>();
</script>

<template>
  <!-- The layer's own text box, and a button at its end that empties it. -->
  <component :is="native" />
  <!-- Tab goes to the text box. -->
  <button
    v-if="widget.control === 'text' && !widget.disabled && widget.value !== ''"
    class="clear-button"
    :aria-label="`Clear ${widget.label}`"
    tabindex="-1"
    @click="setValue({ value: '' })"
  />
</template>
