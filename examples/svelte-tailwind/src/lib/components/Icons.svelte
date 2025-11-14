<script lang="ts" context="module">
  export interface IconProps {
    class?: string;
    title?: string;
  }
</script>

<script lang="ts">
  let { class: className, title, children }: IconProps & { children?: any } = $props();
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
  {@render children?.()}
</svg>

<!-- Specific Icons as separate files would be better, but for now let's create them inline -->
