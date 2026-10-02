<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { usePageList } from '@embedpdf/vue/runtime';
import { useStage } from '@embedpdf/vue/stage';
import { toFieldRef, useForm, useFormState } from '@embedpdf/vue/form';
import type { FormValidation } from '@embedpdf/vue/form';

// How the new fields look: part of the PDF, like the rest of the page.
const look = { color: '#94a3b8', interiorColor: '#f8fafc', strokeWidth: 1, fontSize: 11 };

/** The ebook has no form, so this adds one to its last page, with three required fields. */
function useSignUpForm(onReady: () => void) {
  const form = useForm();
  const status = useFormState((state) => state.status);
  const pages = usePageList();
  const lastPage = computed(() => pages.value.at(-1)?.ref);
  let added = false;

  watch(
    [status, lastPage],
    ([current, page]) => {
      if (current !== 'ready' || !page || added) return;
      added = true;
      const at = (y: number, width = 240, height = 24) => ({
        page,
        rect: { x: 72, y, width, height },
      });
      void (async () => {
        await form.create({
          family: 'text',
          name: 'name',
          required: true,
          widgets: [{ ...at(540), ...look }],
        });
        await form.create({
          family: 'text',
          name: 'email',
          required: true,
          widgets: [{ ...at(576), ...look }],
        });
        await form.create({ family: 'text', name: 'company', widgets: [{ ...at(612), ...look }] });
        await form.create({
          family: 'checkbox',
          name: 'terms',
          required: true,
          widgets: [{ ...at(650, 16, 16), ...look }],
        });
        await form.setValue(toFieldRef('name'), { value: 'Ada Lovelace' });
        onReady();
      })();
    },
    { immediate: true },
  );
}

const form = useForm();
const stage = useStage();
const check = ref<FormValidation | null>(null);

// Check the required fields, and take the reader to the first empty one.
function submit() {
  const result = form.validate();
  check.value = result;
  const widget = result.missing[0]?.widgets[0];
  if (widget?.page) stage.reveal(widget.page, { rect: widget.rect });
}
useSignUpForm(submit);
</script>

<template>
  <div class="toolbar">
    <button type="button" class="button" @click="submit">Submit</button>
    <template v-if="check">
      <output v-if="check.valid" class="readout">Every required field is filled in</output>
      <output v-else class="readout missing">
        Fill in first: {{ check.missing.map((field) => field.name).join(', ') }}
      </output>
    </template>
  </div>
</template>
