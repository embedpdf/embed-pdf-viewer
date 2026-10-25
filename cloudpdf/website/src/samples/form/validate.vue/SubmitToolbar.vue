<script setup lang="ts">
import { ref, watch } from 'vue';
import { useStage } from '@embedpdf/vue/stage';
import { toFieldRef, useForm, useFormState } from '@embedpdf/vue/form';
import type { FormValidation } from '@embedpdf/vue/form';

/** Fill in a name, then check the form, as if it was submitted. */
function useFilledInName(onReady: () => void) {
  const form = useForm();
  const status = useFormState((state) => state.status);
  let started = false;

  watch(
    status,
    (current) => {
      if (current !== 'ready' || started) return;
      started = true;
      void form.setValue(toFieldRef('name'), { value: 'Ada Lovelace' }).then(onReady);
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
  // Where a field shows is its widget's row in the form.
  const first = result.missing[0]?.widgets[0];
  const widget = first ? form.getWidget(first) : null;
  if (widget) stage.reveal(widget.page, { rect: widget.rect });
}
useFilledInName(submit);
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
