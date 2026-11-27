<!-- Render it where the document shows: it fills in what the app knows when the person starts. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { useForm } from '@embedpdf/svelte/form';

  const form = useForm();

  onMount(() => {
    // A field that has a value is left alone, so a second call writes nothing.
    void form.prefill();
  });
</script>
