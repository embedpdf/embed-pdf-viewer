<script lang="ts">
  import { untrack } from 'svelte';
  import { useDocument, useDocuments, type OpenSource } from '@embedpdf/svelte/runtime';
  import type { Role } from './roles';

  let { role = $bindable(), ebook }: { role: Role; ebook: OpenSource } = $props();

  const documents = useDocuments();
  const document = useDocument();
  // The role the open document was opened with: it keeps that one.
  let openedAs = $state(untrack(() => role));

  async function openAgain() {
    await documents.close(document.id);
    await documents.open(ebook, { name: 'ebook.pdf' });
    openedAs = role;
  }
</script>

<div class="toolbar">
  <label class="label">
    Dana Smith, as
    <select class="select" bind:value={role}>
      <option value="reader">reader</option>
      <option value="editor">editor</option>
    </select>
  </label>
  <!-- Checks read in the template follow the document as it opens and closes. -->
  <span class="check" data-allowed={documents.canDownload()}>Download</span>
  <span class="check" data-allowed={documents.canPrint()}>Print</span>
</div>
<p class="note">
  This document opened for a {openedAs}.
  {#if openedAs !== role}
    <button type="button" class="button" onclick={openAgain}>Open it again as {role}</button>
  {/if}
</p>
