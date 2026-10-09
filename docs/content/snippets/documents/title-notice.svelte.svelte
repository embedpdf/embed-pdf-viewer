<script lang="ts">
  import { useMetadataEvent } from '@embedpdf/svelte/metadata';

  let notice = $state('');

  useMetadataEvent(
    (metadata) => metadata.onUpdated,
    ({ metadata, origin }) => {
      if (origin.kind === 'remote') notice = `The title is now "${metadata.title}"`;
    },
  );
</script>

<p role="status">{notice}</p>
