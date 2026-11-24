<script setup lang="ts">
import type { FieldControlProps } from '@embedpdf/vue/form';

// A checkbox as a switch. A click fills the field in, as a click on the checkbox would.
defineProps<FieldControlProps>();
</script>

<template>
  <button
    v-if="widget.control === 'toggle'"
    type="button"
    role="switch"
    class="switch"
    :aria-checked="widget.checked"
    :aria-label="widget.label"
    :disabled="widget.disabled"
    @click="setValue({ checked: !widget.checked })"
  />
</template>
