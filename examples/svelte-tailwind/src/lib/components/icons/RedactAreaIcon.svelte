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
  stroke-width={2}
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden={!title}
  role={title ? 'img' : 'presentation'}
  {...rest}
>
  {#if title}
    <title>{title}</title>
  {/if}
  <path stroke="none" d="M0 0h24v24H0z" fill="none" />
  <path d="M6 20h-1a2 2 0 0 1 -2 -2v-1" />
  <path d="M3 13v-3" />
  <path d="M3 6v-1a2 2 0 0 1 2 -2h1" />
  <path d="M10 3h3" />
  <path d="M17 3h1a2 2 0 0 1 2 2v1" />
  <defs>
    <clipPath id="redactClip">
      <rect x="10" y="10" width="12" height="12" rx="2" />
    </clipPath>
  </defs>
  <rect x="10" y="10" width="12" height="12" rx="2" fill="none" />
  <g clip-path="url(#redactClip)">
    <path d="M-2 24l14 -14" />
    <path d="M2 24l14 -14" />
    <path d="M6 24l14 -14" />
    <path d="M10 24l15 -15" />
    <path d="M14 24l15 -15" />
    <path d="M18 24l15 -15" />
  </g>
</svg>
