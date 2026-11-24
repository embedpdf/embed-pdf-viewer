<!-- Render it where the document shows, so every document you open gets its own list. -->
<script lang="ts">
  import { useForm, type FormGroupInput } from '@embedpdf/svelte/form';

  let { signers }: { signers: FormGroupInput[] } = $props();

  const form = useForm();

  $effect.pre(() => form.setGroups(signers));
</script>
