<!--
  Probes that can be taken away: `probes` show until `control.hide()` is called, `kept` stay. A
  test checks with it what a reader cleans up when its component goes away.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import Probes from './Probes.svelte';

  type ProbeEntry = {
    read: () => unknown;
    pick: (result: unknown) => unknown;
    seen: unknown[];
    scope?: string;
  };

  let {
    probes,
    kept = [],
    control,
  }: { probes: ProbeEntry[]; kept?: ProbeEntry[]; control: { hide?: () => void } } = $props();

  let shown = $state(true);
  // The test holds `control`, so it can hide the probes from outside.
  untrack(() => (control.hide = () => (shown = false)));
</script>

{#if shown}
  <Probes {probes} />
{/if}
<Probes probes={kept} />
