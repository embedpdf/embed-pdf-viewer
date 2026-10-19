<!--
  Several probes at once, each optionally inside a `<DocumentScope>`: `probes` lists them, with
  the document a probe is scoped to, if any.
-->
<script lang="ts">
  import { DocumentScope } from '../../src/runtime';
  import Probe from './Probe.svelte';

  let {
    probes,
  }: {
    probes: {
      read: () => unknown;
      pick: (result: unknown) => unknown;
      seen: unknown[];
      scope?: string;
    }[];
  } = $props();
</script>

{#each probes as probe, index (index)}
  {#if probe.scope}
    <DocumentScope id={probe.scope}>
      <Probe read={probe.read} pick={probe.pick} seen={probe.seen} />
    </DocumentScope>
  {:else}
    <Probe read={probe.read} pick={probe.pick} seen={probe.seen} />
  {/if}
{/each}
