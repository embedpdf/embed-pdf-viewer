<!-- What a settings panel shows for the selected field, and changes with `update()`. -->
<script setup lang="ts">
import { computed, watch } from 'vue';
import { usePageList } from '@embedpdf/vue/runtime';
import { useStage } from '@embedpdf/vue/stage';
import { useInteraction } from '@embedpdf/vue/interaction';
import { useAnnotation } from '@embedpdf/vue/annotation';
import { toFieldRef, useForm, useFormState } from '@embedpdf/vue/form';
import type { FormFieldDTO } from '@embedpdf/vue/form';

/** Start on the sign-up page in design mode, with the name field selected. */
function useDesignForm() {
  const form = useForm();
  const annotation = useAnnotation();
  const interaction = useInteraction();
  const stage = useStage();
  const status = useFormState((state) => state.status);
  const pages = usePageList();
  const signUp = computed(() => pages.value[1]?.ref);
  let started = false;

  watch(
    [status, signUp],
    ([current, page]) => {
      if (current !== 'ready' || !page || started) return;
      started = true;
      stage.goToPage(page);
      interaction.activateTool('form-edit');
      const widget = form.get(toFieldRef('name'))?.widgets[0]?.ref;
      if (widget) annotation.selection.set([widget]);
    },
    { immediate: true },
  );
}

useDesignForm();
const form = useForm();
const { selectedField: field } = useFormState();

function rename(field: FormFieldDTO, event: FocusEvent) {
  const name = (event.target as HTMLInputElement).value.trim();
  if (name && name !== field.name) void form.update(field.ref, { name });
}
</script>

<template>
  <p v-if="!field" class="panel hint">Select a field on the page.</p>
  <div v-else class="panel">
    <label class="setting">
      Name
      <!-- Keyed by the field, so another field's panel starts from its own name. -->
      <input
        :key="field.name"
        class="input"
        :value="field.name"
        @blur="rename(field, $event)"
      />
    </label>
    <label class="setting">
      Tooltip
      <input
        :key="`${field.name}:tooltip`"
        class="input"
        :value="field.alternateName ?? ''"
        @blur="
          form.update(field.ref, {
            alternateName: ($event.target as HTMLInputElement).value || null,
          })
        "
      />
    </label>
    <label class="check">
      <input
        type="checkbox"
        :checked="field.required"
        @change="form.update(field.ref, { required: ($event.target as HTMLInputElement).checked })"
      />
      Required
    </label>
    <label class="check">
      <input
        type="checkbox"
        :checked="field.readOnly"
        @change="form.update(field.ref, { readOnly: ($event.target as HTMLInputElement).checked })"
      />
      Read-only
    </label>
    <button type="button" class="button" @click="form.delete(field.ref)">Remove the field</button>
  </div>
</template>
