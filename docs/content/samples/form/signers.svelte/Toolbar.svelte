<script lang="ts">
  import { useForm } from '@embedpdf/svelte/form';
  import { signers, type Person } from './people';
  import SenderToolbar from './SenderToolbar.svelte';
  import SignerLegend from './SignerLegend.svelte';

  let { person }: { person: Person } = $props();

  const form = useForm();

  // Tell the open document who its groups are.
  form.setGroups(signers);
</script>

<!-- The open document says what its user may do: it is the sender's while they may design it. -->
{#if form.canDesign()}
  <SenderToolbar />
{:else}
  <SignerLegend {person} />
{/if}
