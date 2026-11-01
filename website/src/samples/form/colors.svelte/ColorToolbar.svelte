<script lang="ts">
  import { useForm, useFormSettings } from '@embedpdf/svelte/form';

  const COLORS = [
    ['Accent', null],
    ['Orange', '#ea580c'],
    ['Green', '#16a34a'],
  ] as const;

  const form = useForm();
  const settings = useFormSettings();
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
