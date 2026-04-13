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
  <path d="M20 6v4a1 1 0 0 1 -1 1h-14a1 1 0 0 1 -1 -1v-4a1 1 0 0 1 1 -1h14a1 1 0 0 1 1 1" />
  <path d="M17 11v6h-9" fill="none" />
  <path d="M8 15l-2 2l2 2" fill="none" />
</svg>
