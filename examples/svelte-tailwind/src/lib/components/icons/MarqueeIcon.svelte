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
  stroke-linecap="round"
  stroke-linejoin="round"
  stroke-width={2}
  aria-hidden={!title}
  role={title ? 'img' : 'presentation'}
  {...rest}
>
  {#if title}
    <title>{title}</title>
  {/if}
  <path stroke="none" d="M0 0h24v24H0z" fill="none" />
  <path d="M15 13v4" />
  <path d="M13 15h4" />
  <path d="M15 15m-5 0a5 5 0 1 0 10 0a5 5 0 1 0 -10 0" />
  <path d="M22 22l-3 -3" />
  <path d="M6 18h-1a2 2 0 0 1 -2 -2v-1" />
  <path d="M3 11v-1" />
  <path d="M3 6v-1a2 2 0 0 1 2 -2h1" />
  <path d="M10 3h1" />
  <path d="M15 3h1a2 2 0 0 1 2 2v1" />
</svg>
