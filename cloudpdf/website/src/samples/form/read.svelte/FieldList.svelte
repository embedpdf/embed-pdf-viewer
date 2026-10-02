<script lang="ts">
  import { useFormState, type FormFieldDTO } from '@embedpdf/svelte/form';

  const formState = useFormState();

  /** A field's value as text, whatever its family. */
  function valueText(field: FormFieldDTO): string {
    switch (field.family) {
      case 'text':
      case 'combobox':
        return field.value || '—';
      case 'checkbox':
        return field.checked ? 'checked' : 'not checked';
      case 'radio':
        return field.value === 'Off' ? '—' : field.value;
      case 'listbox':
        return field.selectedValues.join(', ') || '—';
      default:
        return '';
    }
  }
</script>

<ul class="fields">
  {#each formState.fields as field (field.name)}
    <li class="field">
      <span class="field-name">
        {field.name} <span class="family">{field.family}</span>
      </span>
      <span class="field-value">{valueText(field)}</span>
    </li>
  {/each}
</ul>
