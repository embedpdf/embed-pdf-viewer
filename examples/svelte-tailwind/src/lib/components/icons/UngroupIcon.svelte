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
  <rect x="4" y="4" width="7" height="7" rx="1" />
  <rect x="13" y="13" width="7" height="7" rx="1" />
</svg>
