<script lang="ts">
  interface IconProps {
    class?: string;
    title?: string;
  }

  let { class: className, title }: IconProps = $props();
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
>
  {#if title}
    <title>{title}</title>
  {/if}
  <path stroke="none" d="M0 0h24v24H0z" fill="none" />
  <path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" />
  <path d="M9 12h6" />
  <path d="M12 9v6" />
</svg>
