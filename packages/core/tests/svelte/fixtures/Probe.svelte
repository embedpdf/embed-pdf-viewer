<script lang="ts">
  import { useRegistry } from '../../../src/svelte';
  import { resolved } from './sink';

  interface Props {
    label: string;
  }

  let { label }: Props = $props();

  resolved.push({ label, context: useRegistry() });
</script>
