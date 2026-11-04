<script lang="ts">
  import type { PdfEngine } from '@embedpdf/models';

  import { EmbedPDF } from '../../../src/svelte';
  import Probe from './Probe.svelte';
  import Recorder from './Recorder.svelte';

  interface Props {
    label: string;
  }

  let { label }: Props = $props();

  // Never used before the async initialize(), which tests do not await.
  const engine = {} as PdfEngine;
</script>

<EmbedPDF {engine} plugins={[]}>
  {#snippet children(context)}
    <!-- The context handed to the children snippet by this <EmbedPDF>. -->
    <Recorder label={`${label}:snippet`} {context} />
    <!-- The context a descendant component resolves through useRegistry(). -->
    <Probe label={`${label}:probe`} />
  {/snippet}
</EmbedPDF>
