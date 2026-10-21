<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue';
import { usePageList } from '@embedpdf/vue/runtime';
import type { PageRef } from '@embedpdf/vue/runtime';
import { useStage } from '@embedpdf/vue/stage';
import { useForm } from '@embedpdf/vue/form';
import type { FormCapability, FormFieldDTO } from '@embedpdf/vue/form';

// How the new fields look: part of the PDF, like the rest of the page.
const look = { color: '#94a3b8', interiorColor: '#ffffff', strokeWidth: 1, fontSize: 11 };

/** A dropdown, the next row down the page. */
function addDropdown(form: FormCapability, page: PageRef, row: number) {
  return form.create({
    family: 'combobox',
    name: `country_${row + 1}`,
    options: [
      { label: 'Netherlands', value: 'NL' },
      { label: 'Belgium', value: 'BE' },
    ],
    widgets: [{ page, rect: { x: 96, y: 270 + row * 36, width: 160, height: 24 }, ...look }],
  });
}

/** A radio group: one field with a widget per button, each with the value it stands for. */
function addRadioGroup(form: FormCapability, page: PageRef, row: number) {
  const y = 274 + row * 36;
  return form.create({
    family: 'radio',
    name: `plan_${row + 1}`,
    widgets: [
      { page, rect: { x: 96, y, width: 16, height: 16 }, exportValue: 'monthly', ...look },
      { page, rect: { x: 136, y, width: 16, height: 16 }, exportValue: 'yearly', ...look },
    ],
  });
}

const form = useForm();
const stage = useStage();
const pages = usePageList();
// The form's last page is empty: room for new fields.
const lastPage = computed(() => pages.value.at(-1)?.ref);
const added = shallowRef<FormFieldDTO[]>([]);

let started = false;
watch(
  lastPage,
  (page) => {
    if (!page || started) return;
    started = true;
    stage.goToPage(page);
  },
  { immediate: true },
);

// Each new field goes a row further down the page: bring it into view.
async function add(addField: typeof addDropdown) {
  const page = lastPage.value;
  if (!page) return;
  const { field } = await addField(form, page, added.value.length);
  added.value = [...added.value, field];
  stage.reveal(page, { rect: form.getWidget(field.widgets[0])!.rect });
}

const last = computed(() => added.value.at(-1));
const full = computed(() => added.value.length >= 5);

async function removeLast() {
  if (!last.value) return;
  await form.delete(last.value.ref);
  added.value = added.value.slice(0, -1);
}
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
    <button type="button" class="button" :disabled="!last" @click="removeLast">
      Remove the last
    </button>
    <output class="readout">
      {{ added.map((field) => field.name).join(', ') || 'No fields on this page yet' }}
    </output>
  </div>
</template>
