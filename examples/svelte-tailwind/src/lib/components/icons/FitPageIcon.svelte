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
  <path d="M12 20h-6a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2h6" />
  <path d="M18 14v7" />
  <path d="M18 3v7" />
  <path d="M15 18l3 3l3 -3" />
  <path d="M15 6l3 -3l3 3" />
</svg>
