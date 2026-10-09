<script setup lang="ts">
import { computed, watch } from 'vue';
import { usePageList } from '@embedpdf/vue/runtime';
import type { PageRef } from '@embedpdf/vue/runtime';
import { useStage } from '@embedpdf/vue/stage';
import { useForm, useFormState } from '@embedpdf/vue/form';
import type { FormCapability } from '@embedpdf/vue/form';

// How the new fields look: part of the PDF, like the rest of the page.
const look = { color: '#94a3b8', interiorColor: '#f8fafc', strokeWidth: 1, fontSize: 11 };

/** A dropdown, the next row down the page. */
function addDropdown(form: FormCapability, page: PageRef, row: number) {
  return form.create({
    family: 'combobox',
    name: `country_${row + 1}`,
    options: [
      { label: 'Netherlands', value: 'NL' },
      { label: 'Belgium', value: 'BE' },
    ],
    widgets: [{ page, rect: { x: 72, y: 520 + row * 36, width: 160, height: 24 }, ...look }],
  });
}

/** A radio group: one field with a widget per button, each with the value it stands for. */
function addRadioGroup(form: FormCapability, page: PageRef, row: number) {
  const y = 524 + row * 36;
  return form.create({
    family: 'radio',
    name: `plan_${row + 1}`,
    widgets: [
      { page, rect: { x: 72, y, width: 16, height: 16 }, exportValue: 'monthly', ...look },
      { page, rect: { x: 112, y, width: 16, height: 16 }, exportValue: 'yearly', ...look },
    ],
  });
}

const form = useForm();
const stage = useStage();
const { status, fields } = useFormState();
const pages = usePageList();
const lastPage = computed(() => pages.value.at(-1)?.ref);

// The ebook has no form: start with a dropdown on its last page, which has room.
let added = false;
watch(
  [status, lastPage],
  ([current, page]) => {
    if (current !== 'ready' || !page || added) return;
    added = true;
    void addDropdown(form, page, 0).then(({ field }) =>
      stage.reveal(page, { rect: form.getWidget(field.widgets[0])!.rect }),
    );
  },
  { immediate: true },
);

// Each new field goes a row further down the page: bring it into view.
function add(addField: typeof addDropdown) {
  const page = lastPage.value;
  if (!page) return;
  void addField(form, page, fields.value.length).then(({ field }) =>
    stage.reveal(page, { rect: form.getWidget(field.widgets[0])!.rect }),
  );
}

const last = computed(() => fields.value.at(-1));
const full = computed(() => fields.value.length >= 5);
</script>

<template>
  <div class="toolbar">
    <button
      type="button"
      class="button"
      :disabled="!lastPage || full"
      @click="add(addDropdown)"
    >
      Add a dropdown
    </button>
    <button
      type="button"
      class="button"
      :disabled="!lastPage || full"
      @click="add(addRadioGroup)"
    >
      Add a radio group
    </button>
    <button type="button" class="button" :disabled="!last" @click="last && form.delete(last.ref)">
      Remove the last
    </button>
    <output class="readout">{{ fields.map((field) => field.name).join(', ') || 'No fields' }}</output>
  </div>
</template>
