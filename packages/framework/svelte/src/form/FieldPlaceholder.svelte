<!--
  What an empty field shows for its purpose: the layer's paint over the field's picture, never the
  field's value. A control mounts it only for a box that has a placeholder, so a form without
  purposes draws what it drew before. Its color is the form's `fields.placeholder`.
-->
<script lang="ts">
  import type { FormWidgetItem } from '@embedpdf/plugin-form';
  import { cssText, fieldPlaceholderStyleOf, rectInPixels } from '@embedpdf/web';
  import { usePage } from '../runtime/page';
  import { useFormSettings } from './readers.svelte';

  let { item }: { item: FormWidgetItem } = $props();

  const page = usePage();
  const color = useFormSettings((settings) => settings.fields.placeholder);
  const style = $derived(
    cssText(fieldPlaceholderStyleOf(item, rectInPixels(item.box, page.transform), color.current)),
  );
</script>

<span aria-hidden="true" data-epdf-placeholder="" {style}>{item.placeholder}</span>
