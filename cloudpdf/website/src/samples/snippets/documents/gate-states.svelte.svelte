<script lang="ts">
  import { DocumentGate } from '@embedpdf/svelte/runtime';
  import { RenderLayer } from '@embedpdf/svelte/render';
  import { Stage } from '@embedpdf/svelte/stage';
  import PasswordForm from './PasswordForm.svelte';
  import Spinner from './Spinner.svelte';
</script>

<DocumentGate>
  {#snippet fallback()}
    <Spinner />
  {/snippet}
  {#snippet locked(document)}
    <PasswordForm {document} />
  {/snippet}
  {#snippet error(document)}
    <p>Couldn't open {document.name}: {document.error.message}</p>
  {/snippet}
  <Stage>
    {#snippet page()}
      <RenderLayer />
    {/snippet}
  </Stage>
</DocumentGate>
