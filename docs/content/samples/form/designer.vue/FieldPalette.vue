<script setup lang="ts">
import { computed, watch } from 'vue';
import { usePageList } from '@embedpdf/vue/runtime';
import { useStage } from '@embedpdf/vue/stage';
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

/** Start on the ebook's last page, which has room for a form, with the text tool picked. */
function useStartDesigning() {
  const interaction = useInteraction();
  const stage = useStage();
  const pages = usePageList();
  const lastPage = computed(() => pages.value.at(-1)?.ref);
  let started = false;

  watch(
    lastPage,
    (page) => {
      if (!page || started) return;
      started = true;
      stage.goToPage(page);
      interaction.activateTool('form-text');
    },
    { immediate: true },
  );
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
    <output class="readout">
      {{ fields.length === 0 ? 'Click the page to place a field' : `${fields.length} fields` }}
    </output>
  </div>
</template>
