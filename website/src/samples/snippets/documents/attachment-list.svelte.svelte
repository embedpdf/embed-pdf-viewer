<script lang="ts">
  import {
    displayNameOf,
    useAttachment,
    useAttachmentState,
    type AttachedFile,
  } from '@embedpdf/svelte/attachment';
  import { saveFile } from '@embedpdf/svelte/runtime';

  const attachment = useAttachment();
  const state = useAttachmentState();

  async function save(file: AttachedFile) {
    const { bytes, name, mimeType } = await attachment.download(file);
    saveFile(bytes, name, mimeType ?? undefined);
  }
</script>

<ul>
  {#each state.files as file (file.id)}
    <li>
      <bdi>{displayNameOf(file)}</bdi>
      <button disabled={!state.canDownload} onclick={() => save(file)}>Save</button>
    </li>
  {/each}
</ul>
