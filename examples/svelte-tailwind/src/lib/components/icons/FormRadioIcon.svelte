<script lang="ts">
  import type { SVGAttributes } from 'svelte/elements';

  interface Props extends SVGAttributes<SVGSVGElement> {
    title?: string;
  }

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
  <path d="M9 12a2 2 0 1 0 6 0a2 2 0 1 0 -6 0" fill="currentColor" />
  <path d="M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" />
</svg>
