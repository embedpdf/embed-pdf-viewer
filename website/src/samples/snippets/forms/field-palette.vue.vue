<script setup lang="ts">
import { useInteraction, useInteractionState } from '@embedpdf/vue/interaction';

const FIELD_TOOLS = [
  ['form-text', 'Text'],
  ['form-checkbox', 'Checkbox'],
  ['form-radio', 'Radio button'],
  ['form-combobox', 'Dropdown'],
  ['form-listbox', 'List'],
  ['form-signature', 'Signature'],
] as const;

const interaction = useInteraction();
const { activeToolId } = useInteractionState();
</script>

<template>
  <button
    v-for="[id, label] in FIELD_TOOLS"
    :key="id"
    :aria-pressed="activeToolId === id"
    @click="interaction.activateTool(id)"
  >
    {{ label }}
  </button>
</template>
