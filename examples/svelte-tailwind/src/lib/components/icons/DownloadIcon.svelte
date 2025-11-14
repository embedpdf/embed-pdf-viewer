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
  aria-hidden={!title}
  role={title ? 'img' : 'presentation'}
>
  {#if title}
    <title>{title}</title>
  {/if}
  <path
    stroke-linecap="round"
    stroke-linejoin="round"
    stroke-width={2}
    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
  />
</svg>
