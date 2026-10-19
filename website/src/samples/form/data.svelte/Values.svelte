<!-- The values as plain data, keyed by full name: what you'd send to your backend. -->
<script lang="ts">
  import { useForm, useFormState } from '@embedpdf/svelte/form';

  const form = useForm();
  // The state changes with every value, so this reads them again each time.
  const fields = useFormState((formState) => formState.fields);
  const values = $derived.by(() => {
    void fields.current;
    return JSON.stringify(form.exportValues(), null, 2);
  });
</script>

<pre class="values">{values}</pre>
