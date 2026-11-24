<!-- NextField.svelte -->
<script lang="ts">
  import { Anchored } from '@embedpdf/svelte/anchored';
  import { useForm, useFormState, useFormWidgetAnchor } from '@embedpdf/svelte/form';

  const form = useForm();
  const formState = useFormState();

  // The next required field that is still empty.
  const next = $derived.by(() => {
    void formState.fields; // again when a field is filled in
    return form.validate().missing[0] ?? null;
  });
  const anchor = useFormWidgetAnchor(() =>
    next ? (form.getWidgets(next.ref)[0]?.ref ?? null) : null,
  );
</script>

{#if next}
  <Anchored anchor={anchor.current} placement="left" gap={6} pinned>
    <button class="next-field" onclick={() => form.focus(next.ref)}>
      {next.kind === 'signature' ? 'Sign' : 'Fill in'}
    </button>
  </Anchored>
{/if}
