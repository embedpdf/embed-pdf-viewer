<script lang="ts">
  import { untrack } from 'svelte';
  import { usePageList } from '@embedpdf/svelte/runtime';
  import { useStage } from '@embedpdf/svelte/stage';
  import { toFieldRef, useFormEvent, useFormValue } from '@embedpdf/svelte/form';

  const stage = useStage();
  const pages = usePageList();
  const total = useFormValue(toFieldRef('invoice.total'));
  let refused = $state<string | null>(null);

  // Start on the invoice: its amounts and its total are calculated by scripts.
  let started = false;
  $effect(() => {
    const page = pages.current[3]?.ref;
    if (!page || started) return;
    started = true;
    untrack(() => stage.goToPage(page));
  });

  // A script refused a value, such as a date that isn't day/month/year.
  useFormEvent(
    (form) => form.onValidationRejected,
    ({ field, issues }) => (refused = `${field.name}: ${issues[0]?.message ?? 'refused'}`),
  );
</script>

<div class="toolbar">
  <output class="readout">
    Total: {total.current && 'value' in total.current && total.current.value
      ? total.current.value
      : 'type a quantity'}
  </output>
  {#if refused}<output class="refused">{refused}</output>{/if}
</div>
