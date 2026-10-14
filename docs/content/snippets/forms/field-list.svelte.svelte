<script lang="ts">
  import { useFormState } from '@embedpdf/svelte/form';

  const state = useFormState();
</script>

<ul>
  {#each state.fields as field (field.name)}
    <li>{field.name}: {field.family}</li>
  {/each}
</ul>
