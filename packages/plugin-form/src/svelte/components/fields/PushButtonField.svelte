<script lang="ts">
  import { PDF_FORM_FIELD_FLAG } from '@embedpdf/models';
  import type { PushButtonFieldProps } from '../../../shared/components/types';

  let { annotation, isEditable }: PushButtonFieldProps = $props();

  const field = $derived(annotation.field);
  const flag = $derived(field.flag);
  const name = $derived(field.alternateName || field.name);
  const isDisabled = $derived(!isEditable || !!(flag & PDF_FORM_FIELD_FLAG.READONLY));
</script>

<button
  disabled={isDisabled}
  aria-label={name}
  style:position="absolute"
  style:top="0"
  style:left="0"
  style:width="100%"
  style:height="100%"
  style:padding="0"
  style:margin="0"
>
  {name}
</button>
