<!-- Calls `useLink()` while created and hands the API to the test. -->
<script lang="ts">
  import { useLink } from '../../src/link';
  import type { LinkCapability } from '../../src/link';

  let { onLink }: { onLink: (link: LinkCapability) => void } = $props();

  // svelte-ignore state_referenced_locally
  onLink(useLink());
</script>
