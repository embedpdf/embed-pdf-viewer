<script lang="ts">
  import { untrack } from 'svelte';
  import { usePageList } from '@embedpdf/svelte/runtime';
  import { useStage } from '@embedpdf/svelte/stage';
  import { toFieldRef, useForm, useFormState, type FormValidation } from '@embedpdf/svelte/form';

  // How the new fields look: part of the PDF, like the rest of the page.
  const look = { color: '#94a3b8', interiorColor: '#f8fafc', strokeWidth: 1, fontSize: 11 };

  const form = useForm();
  const stage = useStage();
  const status = useFormState((formState) => formState.status);
  const pages = usePageList();
  let check = $state.raw<FormValidation | null>(null);

  // Check the required fields, and take the reader to the first empty one.
  function submit() {
    const result = form.validate();
    check = result;
    // Where a field shows is its widget's row in the form.
    const first = result.missing[0]?.widgets[0];
    const widget = first ? form.getWidget(first) : null;
    if (widget) stage.reveal(widget.page, { rect: widget.rect });
  }

  // The ebook has no form, so this adds one to its last page, with three required fields.
  let added = false;
  $effect(() => {
    const page = pages.current.at(-1)?.ref;
    if (status.current !== 'ready' || !page || added) return;
    added = true;
    const at = (y: number, width = 240, height = 24) => ({ page, rect: { x: 72, y, width, height } });
    untrack(async () => {
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
      submit();
    });
  });
</script>

<div class="toolbar">
  <button type="button" class="button" onclick={submit}>Submit</button>
  {#if check}
    {#if check.valid}
      <output class="readout">Every required field is filled in</output>
    {:else}
      <output class="readout missing">
        Fill in first: {check.missing.map((field) => field.name).join(', ')}
      </output>
    {/if}
  {/if}
</div>
