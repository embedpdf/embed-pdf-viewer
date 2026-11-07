<script lang="ts">
  import { useOutlineEvent } from '@embedpdf/svelte/outline';

  let notice = $state('');

  useOutlineEvent(
    (outline) => outline.onChanged,
    ({ type, items, origin }) => {
      if (origin.kind === 'remote') notice = `Someone ${type} ${items.length} bookmark(s)`;
    },
  );
</script>

<p role="status">{notice}</p>
