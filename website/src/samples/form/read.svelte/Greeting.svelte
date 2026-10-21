<script lang="ts">
  import { untrack } from 'svelte';
  import { usePageList } from '@embedpdf/svelte/runtime';
  import { useStage } from '@embedpdf/svelte/stage';
  import {
    toFieldRef,
    useForm,
    useFormEvent,
    useFormState,
    useFormValue,
  } from '@embedpdf/svelte/form';

  const form = useForm();
  const stage = useStage();
  const status = useFormState((formState) => formState.status);
  const pages = usePageList();
  const name = useFormValue(toFieldRef('name'));
  let changed = $state<string | null>(null);

  // Start on the sign-up page, with a name filled in.
  let started = false;
  $effect(() => {
    const page = pages.current[1]?.ref;
    if (status.current !== 'ready' || !page || started) return;
    started = true;
    untrack(() => {
      stage.goToPage(page);
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
