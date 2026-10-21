<script lang="ts">
  import { useAttachmentEvent } from '@embedpdf/svelte/attachment';

  let notice = $state('');

  useAttachmentEvent(
    (attachment) => attachment.onChanged,
    ({ type, files, origin }) => {
      if (origin.kind === 'remote') notice = `Someone ${type} ${files.length} file(s)`;
    },
  );
</script>

<p role="status">{notice}</p>
