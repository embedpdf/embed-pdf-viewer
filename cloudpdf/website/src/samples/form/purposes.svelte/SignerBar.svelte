<!-- A signer starts: the app fills in what it knows about them, in their own fields, as one change. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { useForm } from '@embedpdf/svelte/form';
  import { people, type Person } from './people';

  let { person }: { person: Person } = $props();

  const form = useForm();
  let filled = $state<number | null>(null);

  onMount(() => {
    // Another signer's field is left for them, and so is a field that has a value.
    void form.prefill().then(({ applied }) => (filled = applied.length));
  });
</script>

<div class="toolbar">
  <output class="readout">
    {filled === null
      ? 'Filling in what the app knows…'
      : `Filled in for ${people[person].name}: ${filled} ${filled === 1 ? 'field' : 'fields'}`}
  </output>
</div>
