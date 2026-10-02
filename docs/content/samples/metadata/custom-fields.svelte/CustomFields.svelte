<!-- Your own fields, kept in the document: add one, change one, remove one. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { isPluginError } from '@embedpdf/svelte/runtime';
  import { useMetadata, useMetadataState } from '@embedpdf/svelte/metadata';

  const metadata = useMetadata();
  const fields = useMetadataState();
  let name = $state('');
  let value = $state('');
  let error = $state<string | null>(null);

  // Two fields of our own, written on load. Setting the same values again changes nothing.
  onMount(() => {
    void metadata.custom.update({ contractId: 'C-2026-114', reviewedBy: 'dana' });
  });

  const canUpdate = $derived(metadata.canUpdate());

  async function add() {
    try {
      await metadata.custom.update({ [name.trim()]: value });
      name = '';
      value = '';
      error = null;
    } catch (failure) {
      // A name the PDF can't take, such as one of the standard fields.
      if (isPluginError(failure, 'invalid-input')) error = failure.message;
      else throw failure;
    }
  }
</script>

<section class="panel">
  <table class="fields">
    <thead>
      <tr>
        <th>Name</th>
        <th>Value</th>
        <th aria-label="Remove"></th>
      </tr>
    </thead>
    <tbody>
      {#each Object.entries(fields.custom ?? {}) as [key, text] (key)}
        <tr>
          <td class="key">{key}</td>
          <td>{text}</td>
          <td>
            <!-- null removes a field; the others stay as they are. -->
            <button
              type="button"
              class="button quiet"
              disabled={!canUpdate}
              onclick={() => metadata.custom.update({ [key]: null })}
            >
              Remove
            </button>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
  <form
    class="add"
    onsubmit={(event) => {
      event.preventDefault();
      void add();
    }}
  >
    <input
      class="field"
      aria-label="Name"
      placeholder="Name, such as approvedOn"
      bind:value={name}
    />
    <input class="field" aria-label="Value" placeholder="Value" bind:value />
    <button type="submit" class="button" disabled={!canUpdate || !name.trim()}>Add</button>
  </form>
  {#if error}
    <p class="error">{error}</p>
  {/if}
</section>
