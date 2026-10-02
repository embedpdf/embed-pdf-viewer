<!-- What a settings panel shows for the selected field, and changes with `update()`. -->
<script lang="ts">
  import { untrack } from 'svelte';
  import { usePageList } from '@embedpdf/svelte/runtime';
  import { useStage } from '@embedpdf/svelte/stage';
  import { useInteraction } from '@embedpdf/svelte/interaction';
  import { useAnnotation } from '@embedpdf/svelte/annotation';
  import { useForm, useFormState } from '@embedpdf/svelte/form';

  // How the new fields look: part of the PDF, like the rest of the page.
  const look = { color: '#94a3b8', interiorColor: '#f8fafc', strokeWidth: 1, fontSize: 11 };

  const form = useForm();
  const annotation = useAnnotation();
  const interaction = useInteraction();
  const stage = useStage();
  const formState = useFormState();
  const pages = usePageList();

  // The ebook has no form: add two fields to its last page, and select the first in design mode.
  let added = false;
  $effect(() => {
    const page = pages.current.at(-1)?.ref;
    if (formState.status !== 'ready' || !page || added) return;
    added = true;
    const at = (y: number) => ({ page, rect: { x: 72, y, width: 240, height: 24 }, ...look });
    untrack(async () => {
      const { field } = await form.create({ family: 'text', name: 'name', widgets: [at(540)] });
      await form.create({ family: 'text', name: 'email', widgets: [at(576)] });
      stage.goToPage(page);
      interaction.activateTool('form-edit');
      const widget = field.widgets[0]?.ref;
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
