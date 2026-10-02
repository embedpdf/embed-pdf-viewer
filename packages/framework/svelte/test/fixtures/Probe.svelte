<!--
  Calls a reader while it's created, and records what `pick` takes from it every time that
  changes: one entry per effect run, the Svelte analog of a render count.
-->
<script lang="ts" generics="Result">
  import { untrack } from 'svelte';

  let {
    read,
    pick,
    seen,
  }: {
    read: () => Result;
    pick: (result: Result) => unknown;
    seen: unknown[];
  } = $props();

  // A reader is called once, while the component is created.
  const result = untrack(() => read());

  $effect(() => {
    seen.push(pick(result));
  });
</script>
