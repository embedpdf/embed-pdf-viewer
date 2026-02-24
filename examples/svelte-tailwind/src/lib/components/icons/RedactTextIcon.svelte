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
  <path d="M7 4h10" />
  <path d="M12 4v8" />
  <defs>
    <clipPath id="stripeClip">
      <rect x="2" y="12" width="20" height="10" rx="2" />
    </clipPath>
  </defs>
  <rect x="2" y="12" width="20" height="10" rx="2" fill="none" />
  <g clip-path="url(#stripeClip)">
    <path d="M-7 24l12 -12" />
    <path d="M-3 24l12 -12" />
    <path d="M1 24l12 -12" />
    <path d="M5 24l12 -12" />
    <path d="M9 24l12 -12" />
    <path d="M13 24l12 -12" />
    <path d="M17 24l12 -12" />
    <path d="M21 24l12 -12" />
    <path d="M25 24l12 -12" />
  </g>
</svg>
