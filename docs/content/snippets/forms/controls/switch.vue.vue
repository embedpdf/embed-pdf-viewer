<!-- FieldSwitch.vue -->
<script setup lang="ts">
import type { FieldControlProps } from '@embedpdf/vue/form';

defineProps<FieldControlProps>();
</script>

<template>
  <!-- It fills its frame (`width` and `height` 100% in your CSS), and turns with the field. -->
  <button
    v-if="widget.control === 'toggle'"
    role="switch"
    class="switch"
    :aria-checked="widget.checked"
    :aria-label="widget.label"
    :disabled="widget.disabled"
    @click="setValue({ checked: !widget.checked })"
  />
</template>
