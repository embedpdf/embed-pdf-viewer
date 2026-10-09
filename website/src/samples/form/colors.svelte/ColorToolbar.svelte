<script lang="ts">
  import { untrack } from 'svelte';
  import { usePageList } from '@embedpdf/svelte/runtime';
  import { useStage } from '@embedpdf/svelte/stage';
  import { useForm, useFormSettings, useFormState } from '@embedpdf/svelte/form';

  const COLORS = [
    ['Accent', null],
    ['Orange', '#ea580c'],
    ['Green', '#16a34a'],
  ] as const;

  const form = useForm();
  const stage = useStage();
  const settings = useFormSettings();
  const status = useFormState((formState) => formState.status);
  const pages = usePageList();

  // The ebook has no form, so this adds one to its last page: fields with no border of their own.
  let added = false;
  $effect(() => {
    const page = pages.current.at(-1)?.ref;
    if (status.current !== 'ready' || !page || added) return;
    added = true;
    const at = (y: number, width = 240, height = 24) => ({ page, rect: { x: 72, y, width, height } });
    untrack(async () => {
      await form.create({ family: 'text', name: 'name', widgets: [{ ...at(540), fontSize: 11 }] });
      await form.create({ family: 'text', name: 'email', widgets: [{ ...at(576), fontSize: 11 }] });
      await form.create({ family: 'checkbox', name: 'updates', widgets: [at(614, 16, 16)] });
      stage.goToPage(page);
    });
  });
</script>

<div class="toolbar">
  <span class="label">Edges</span>
  <div class="segments">
    {#each COLORS as [label, color] (label)}
      <button
        type="button"
        class="segment"
        aria-pressed={settings.fields.border === color}
        onclick={() => form.updateSettings({ fields: { border: color } })}
      >
        {label}
      </button>
    {/each}
  </div>
  <span class="label">Focus</span>
  <div class="segments">
    {#each COLORS as [label, color] (label)}
      <button
        type="button"
        class="segment"
        aria-pressed={settings.focus.color === color}
        onclick={() => form.updateSettings({ focus: { color } })}
      >
        {label}
      </button>
    {/each}
  </div>
</div>
