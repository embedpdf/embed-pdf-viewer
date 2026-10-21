<!-- What a settings panel shows for the selected field, and changes with `update()`. -->
<script lang="ts">
  import { untrack } from 'svelte';
  import { usePageList } from '@embedpdf/svelte/runtime';
  import { useStage } from '@embedpdf/svelte/stage';
  import { useInteraction } from '@embedpdf/svelte/interaction';
  import { useAnnotation } from '@embedpdf/svelte/annotation';
  import { toFieldRef, useForm, useFormState } from '@embedpdf/svelte/form';

  const form = useForm();
  const annotation = useAnnotation();
  const interaction = useInteraction();
  const stage = useStage();
  const formState = useFormState();
  const pages = usePageList();

  // Start on the sign-up page in design mode, with the name field selected.
  let started = false;
  $effect(() => {
    const page = pages.current[1]?.ref;
    if (formState.status !== 'ready' || !page || started) return;
    started = true;
    untrack(() => {
      stage.goToPage(page);
      interaction.activateTool('form-edit');
      const widget = form.get(toFieldRef('name'))?.widgets[0]?.ref;
      if (widget) annotation.selection.set([widget]);
    });
  });
</script>

{#if formState.selectedField}
  {@const field = formState.selectedField}
  <div class="panel">
    <label class="setting">
      Name
      <input
        class="input"
        value={field.name}
        onblur={(event) => {
          const name = event.currentTarget.value.trim();
          if (name && name !== field.name) void form.update(field.ref, { name });
        }}
      />
    </label>
    <label class="setting">
      Tooltip
      <input
        class="input"
        value={field.alternateName ?? ''}
        onblur={(event) =>
          void form.update(field.ref, { alternateName: event.currentTarget.value || null })}
      />
    </label>
    <label class="check">
      <input
        type="checkbox"
        checked={field.required}
        onchange={(event) => void form.update(field.ref, { required: event.currentTarget.checked })}
      />
      Required
    </label>
    <label class="check">
      <input
        type="checkbox"
        checked={field.readOnly}
        onchange={(event) => void form.update(field.ref, { readOnly: event.currentTarget.checked })}
      />
      Read-only
    </label>
    <button type="button" class="button" onclick={() => void form.delete(field.ref)}>
      Remove the field
    </button>
  </div>
{:else}
  <p class="panel hint">Select a field on the page.</p>
{/if}
