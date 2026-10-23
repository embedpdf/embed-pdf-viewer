<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useInteraction, useInteractionState } from '@embedpdf/vue/interaction';
import { useForm, useFormState } from '@embedpdf/vue/form';

const FIELD_TOOLS = [
  ['form-text', 'Text'],
  ['form-checkbox', 'Checkbox'],
  ['form-radio', 'Radio button'],
  ['form-combobox', 'Dropdown'],
  ['form-listbox', 'List'],
  ['form-signature', 'Signature'],
] as const;

/** Start with the text tool picked: the printed form has boxes, but no fields yet. */
function useStartDesigning() {
  const interaction = useInteraction();
  onMounted(() => interaction.activateTool('form-text'));
}

useStartDesigning();
const interaction = useInteraction();
const form = useForm();
const { activeToolId } = useInteractionState();
const { fields } = useFormState();
// The pointer fills the form in; every other tool here designs it.
const filling = computed(() => activeToolId.value === 'pointer');
</script>

<template>
  <p v-if="!form.canDesign()" class="readout">This document's form can't be changed.</p>
  <div v-else class="toolbar">
    <div class="segments">
      <button
        type="button"
        class="segment"
        :aria-pressed="filling"
        @click="interaction.activateTool('pointer')"
      >
        Fill in
      </button>
      <button
        type="button"
        class="segment"
        :aria-pressed="!filling"
        @click="interaction.activateTool('form-edit')"
      >
        Design
      </button>
    </div>
    <button
      v-for="[id, label] in FIELD_TOOLS"
      :key="id"
      type="button"
      class="button"
      :aria-pressed="activeToolId === id"
      @click="interaction.activateTool(id)"
    >
      {{ label }}
    </button>
    <output class="readout">{{ fields.length }} fields: click the page to place another</output>
  </div>
</template>
