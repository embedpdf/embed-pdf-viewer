<script lang="ts">
  import type { PDFContextState } from '../../../src/svelte';
  import { resolved } from './sink';

  interface Props {
    label: string;
    context: PDFContextState;
  }

  let { label, context }: Props = $props();

  resolved.push({ label, context });
</script>
