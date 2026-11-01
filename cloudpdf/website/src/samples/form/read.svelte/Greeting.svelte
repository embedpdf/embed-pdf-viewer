<script lang="ts">
  import { untrack } from 'svelte';
  import {
    toFieldRef,
    useForm,
    useFormEvent,
    useFormState,
    useFormValue,
  } from '@embedpdf/svelte/form';

  const form = useForm();
  const status = useFormState((formState) => formState.status);
  const name = useFormValue(toFieldRef('name'));
  let changed = $state<string | null>(null);

  // On load: a name filled in.
  let started = false;
  $effect(() => {
    if (status.current !== 'ready' || started) return;
    started = true;
    untrack(() => {
      void form.setValue(toFieldRef('name'), { value: 'Ada Lovelace' });
    });
  });

  // Every change, whoever made it: typing, a script, or code.
  useFormEvent(
    (plugin) => plugin.onValueChanged,
    ({ field }) => (changed = field.name),
  );
</script>

<div class="toolbar">
  <output class="readout">
    Hello, {name.current && 'value' in name.current && name.current.value
      ? name.current.value
      : 'stranger'}
  </output>
  {#if changed}<output class="note">Last change: {changed}</output>{/if}
</div>
