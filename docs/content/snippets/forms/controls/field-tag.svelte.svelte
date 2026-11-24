<!-- FieldTag.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { Anchored } from '@embedpdf/svelte/anchored';
  import { useForm, useFormWidgetAnchor, type FormField } from '@embedpdf/svelte/form';

  let { field, children }: { field: FormField; children: Snippet } = $props();

  // A tag beside the first box of a field.
  const form = useForm();
  const anchor = useFormWidgetAnchor(() => form.getWidgets(field.ref)[0]?.ref ?? null);
</script>

<Anchored anchor={anchor.current} placement="left" gap={4} pinned>
  <span class="tag">{@render children()}</span>
</Anchored>
