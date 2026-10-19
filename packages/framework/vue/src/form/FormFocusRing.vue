<!--
  The focus ring of a field, painted above the field's picture and its
  see-through native control. An inset outline on the box itself would sit
  under an opaque child, so rectangular checkboxes and dropdowns would look
  unfocused while they are active in the native Tab order.
-->
<script setup lang="ts">
import { formFocusRingStyleOf } from '@embedpdf/web';

defineProps<{
  visible: boolean;
  /** The ring's CSS color: the form's `focus.color` setting, behind its CSS variable. */
  color: string;
}>();
</script>

<template>
  <span
    v-if="visible"
    aria-hidden="true"
    data-embedpdf-form-focus-ring=""
    :style="formFocusRingStyleOf(color)"
  />
</template>
