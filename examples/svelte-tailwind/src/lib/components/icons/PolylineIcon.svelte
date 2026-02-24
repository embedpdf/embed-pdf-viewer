<script lang="ts">
  import type { SVGAttributes } from 'svelte/elements';
  import ZigzagIcon from './ZigzagIcon.svelte';

  // We extend SVGAttributes to allow style, onclick, aria-*, etc.
  interface Props extends SVGAttributes<SVGSVGElement> {
    title?: string;
  }

  let props: Props = $props();
</script>

<ZigzagIcon {...props} />
