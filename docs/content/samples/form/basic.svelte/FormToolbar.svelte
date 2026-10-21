<script lang="ts">
  import { untrack } from 'svelte';
  import { usePageList } from '@embedpdf/svelte/runtime';
  import { useStage } from '@embedpdf/svelte/stage';
  import { useFormState } from '@embedpdf/svelte/form';

  const stage = useStage();
  const formState = useFormState();
  const pages = usePageList();

  // Start on the sign-up page, the form's first fields.
  let started = false;
  $effect(() => {
    const page = pages.current[1]?.ref;
    if (!page || started) return;
    started = true;
    untrack(() => stage.goToPage(page));
  });
</script>

<div class="toolbar">
  <output class="readout">{formState.fields.length} fields: click one and fill it in</output>
</div>
