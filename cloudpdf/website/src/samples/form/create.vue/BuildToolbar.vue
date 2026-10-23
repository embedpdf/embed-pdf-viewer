<script setup lang="ts">
import { computed, shallowRef } from 'vue';
import { usePageList } from '@embedpdf/vue/runtime';
import type { PageRef } from '@embedpdf/vue/runtime';
import { useStage } from '@embedpdf/vue/stage';
import { useForm } from '@embedpdf/vue/form';
import type { FormCapability, FormFieldDTO } from '@embedpdf/vue/form';

// The printed boxes are the fields' look: a new field only sets its text size.
const look = { fontSize: 11 };

// The printed table of group tickets: a row every 36 points from the top at 470, with a country
// box at x 96 and a circle for each ticket at x 330 and 430.
const rowTop = (row: number) => 470 + row * 36;

/** A dropdown in a row's country box. */
function addDropdown(form: FormCapability, page: PageRef, row: number) {
  return form.create({
    family: 'combobox',
    name: `country_${row + 1}`,
    options: [
      { label: 'Netherlands', value: 'NL' },
      { label: 'Belgium', value: 'BE' },
      { label: 'Germany', value: 'DE' },
    ],
    widgets: [{ page, rect: { x: 96, y: rowTop(row), width: 160, height: 24 }, ...look }],
  });
}

/** A radio group in a row's two circles: one field, a widget per circle, each with its value. */
function addRadioGroup(form: FormCapability, page: PageRef, row: number) {
  const y = rowTop(row) + 4;
  return form.create({
    family: 'radio',
    name: `ticket_${row + 1}`,
    widgets: [
      { page, rect: { x: 330, y, width: 16, height: 16 }, exportValue: 'one-day', ...look },
      { page, rect: { x: 430, y, width: 16, height: 16 }, exportValue: 'both-days', ...look },
    ],
  });
}

const form = useForm();
const stage = useStage();
const pages = usePageList();
const page = computed(() => pages.value[0]?.ref); // the printed form
const added = shallowRef<FormFieldDTO[]>([]);

// Each kind of field fills its column from the top: the next row that hasn't got one.
function rowFor(family: FormFieldDTO['family']) {
  return added.value.filter((field) => field.family === family).length;
}

async function add(addField: typeof addDropdown, family: FormFieldDTO['family']) {
  if (!page.value) return;
  const { field } = await addField(form, page.value, rowFor(family));
  added.value = [...added.value, field];
  stage.reveal(page.value, { rect: form.getWidget(field.widgets[0])!.rect });
}

const last = computed(() => added.value.at(-1));

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
      :disabled="!page || rowFor('combobox') >= 5"
      @click="add(addDropdown, 'combobox')"
    >
      Add a dropdown
    </button>
    <button
      type="button"
      class="button"
      :disabled="!page || rowFor('radio') >= 5"
      @click="add(addRadioGroup, 'radio')"
    >
      Add a radio group
    </button>
    <button type="button" class="button" :disabled="!last" @click="removeLast">
      Remove the last
    </button>
    <output class="readout">
      {{ added.map((field) => field.name).join(', ') || 'No fields in the table yet' }}
    </output>
  </div>
</template>
