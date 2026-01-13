<script lang="ts">
  import type { SVGAttributes } from 'svelte/elements';

  // We extend SVGAttributes to allow style, onclick, aria-*, etc.
  interface Props extends SVGAttributes<SVGSVGElement> {
    title?: string;
  }

  // 1. Capture 'class' as className to avoid keyword conflict
  // 2. Capture 'title' specific logic
  // 3. Capture '...rest' to pass down styles/events
  let { class: className, title, ...rest }: Props = $props();
</script>

<svg
  class={className}
  fill="none"
  stroke="currentColor"
  viewBox="0 0 24 24"
  aria-hidden={!title}
  role={title ? 'img' : 'presentation'}
  {...rest}
>
  {#if title}
    <title>{title}</title>
  {/if}
  <path
    stroke-linecap="round"
    stroke-linejoin="round"
    stroke-width={2}
    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
  />
</svg>
