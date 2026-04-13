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
  <path stroke="#000000" d="M3 19h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4" />
  <path stroke="#000000" d="M12.5 5.5l4 4" />
  <path stroke="#000000" d="M4.5 13.5l4 4" />
  <path stroke="currentColor" fill="currentColor" d="M21 15v4h-8l4 -4l4 0" />
</svg>
