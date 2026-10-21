<!-- The files the document carries: attach some, save one, remove one. -->
<script lang="ts">
  import { saveFile } from '@embedpdf/svelte/runtime';
  import {
    displayNameOf,
    useAttachment,
    useAttachmentState,
    type AttachedFile,
  } from '@embedpdf/svelte/attachment';

  const attachment = useAttachment();
  const state = useAttachmentState();

  /** A file's size, as people read it. */
  const sizeOf = (bytes: number | null) =>
    bytes === null ? '' : bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;

  async function save(file: AttachedFile) {
    const { bytes, name, mimeType } = await attachment.download(file);
    saveFile(bytes, name, mimeType ?? undefined);
  }

  function attach(event: Event & { currentTarget: HTMLInputElement }) {
    const picked = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = '';
    if (picked.length > 0) void attachment.add(picked.map((data) => ({ data })));
  }
</script>

<aside class="files">
  <header class="files-header">
    <h3 class="files-title">Files</h3>
    <label class="button primary" data-disabled={!state.canAdd || undefined}>
      Attach
      <input type="file" multiple hidden disabled={!state.canAdd} onchange={attach} />
    </label>
  </header>
  {#if state.files.length === 0}
    <p class="empty">Attach a file to carry it inside the document.</p>
  {:else}
    <ul class="list">
      {#each state.files as file (file.id)}
        <li class="row" data-pending={attachment.isPending(file) || undefined}>
          <button
            type="button"
            class="row-name"
            disabled={!state.canDownload}
            onclick={() => save(file)}
          >
            <bdi>{displayNameOf(file)}</bdi>
            <span class="row-size">{sizeOf(file.size)}</span>
          </button>
          <button
            type="button"
            class="row-remove"
            aria-label={`Remove ${displayNameOf(file)}`}
            disabled={!attachment.canRemove(file)}
            onclick={() => attachment.remove(file)}
          >
            ×
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</aside>
