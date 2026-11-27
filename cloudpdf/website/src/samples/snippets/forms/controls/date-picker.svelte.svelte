<!-- DatePicker.svelte -->
<script lang="ts">
  import { Anchored } from '@embedpdf/svelte/anchored';
  import {
    formatDate,
    useForm,
    useFormEvent,
    useFormWidgetAnchor,
    type DatePartsInput,
    type FormFocusChangedEvent,
  } from '@embedpdf/svelte/form';
  import Calendar from './Calendar.svelte'; // your own

  const form = useForm();
  let focus = $state.raw<FormFocusChangedEvent | null>(null);
  useFormEvent(
    (form) => form.onFocusChanged,
    (event) => (focus = event),
  );
  const anchor = useFormWidgetAnchor(() => focus?.widget ?? null);

  const field = $derived(focus?.field ?? null);
  const format = $derived(field && 'format' in field ? field.format : null);

  function pick(day: DatePartsInput) {
    if (!field || format?.kind !== 'date') return;
    const { ref } = field;
    const value = formatDate(day, format.pattern);
    // A text box writes what was typed when the cursor leaves it: the picked day goes in after.
    (document.activeElement as HTMLElement | null)?.blur();
    void form.setValue(ref, { value });
  }
</script>

{#if field && format?.kind === 'date'}
  <Anchored anchor={anchor.current} placement="bottom-start">
    <!-- A press on the calendar leaves the cursor in the field until a day is picked. -->
    <div role="presentation" onmousedown={(event) => event.preventDefault()}>
      <Calendar onPick={pick} />
    </div>
  </Anchored>
{/if}
