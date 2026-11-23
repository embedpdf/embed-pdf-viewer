<script lang="ts">
  import { Anchored } from '@embedpdf/svelte/anchored';
  import { useForm, useFormWidgetAnchor, type FormField } from '@embedpdf/svelte/form';

  let { field }: { field: FormField } = $props();

  // A tag beside the first box of a field: pinned, so it stays on the field. A pinned tag keeps
  // its size at every zoom, so this one is small: it fits in the page's margin on a phone too.
  const form = useForm();
  const anchor = useFormWidgetAnchor(() => form.getWidgets(field.ref)[0]?.ref ?? null);
</script>

<Anchored anchor={anchor.current} placement="left" gap={6} pinned>
  <button
    type="button"
    class="tag"
    title="Required"
    aria-label="Required: {field.alternateName ?? field.name}"
    onclick={() => form.focus(field.ref)}
  >
    !
  </button>
</Anchored>
